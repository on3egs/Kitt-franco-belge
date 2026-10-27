(() => {
  "use strict";

  const CODE_PREFIX = "KR1.";
  const CODE_LIFETIME_MS = 10 * 60 * 1000;
  const CHUNK_BYTES = 16 * 1024;
  const BUFFER_HIGH_WATER = 512 * 1024;
  const BUFFER_LOW_WATER = 128 * 1024;
  const MAX_ACCEPTED_SIZE = 5 * 1024 * 1024 * 1024;
  const MAX_BLOB_FALLBACK = window.matchMedia?.("(pointer: coarse)")?.matches ? 64 * 1024 * 1024 : 256 * 1024 * 1024;

  const byId = (id) => document.getElementById(id);
  const ui = {
    support: byId("support-state"),
    rolePicker: byId("role-picker"),
    sendSetup: byId("send-setup"),
    receiveSetup: byId("receive-setup"),
    createOffer: byId("create-offer"),
    offerPanel: byId("offer-panel"),
    offerCode: byId("offer-code"),
    answerCode: byId("answer-code"),
    applyAnswer: byId("apply-answer"),
    createAnswer: byId("create-answer"),
    answerPanel: byId("answer-panel"),
    incomingOffer: byId("incoming-offer"),
    localAnswer: byId("local-answer-code"),
    selectedFiles: byId("selected-files"),
    sendFilesInput: byId("send-files"),
    sendSelected: byId("send-selected"),
    connectionPanel: byId("connection-panel"),
    connectionLight: byId("connection-light"),
    connectionTitle: byId("connection-title"),
    connectionDetail: byId("connection-detail"),
    incomingCard: byId("incoming-card"),
    incomingName: byId("incoming-name"),
    incomingMeta: byId("incoming-meta"),
    acceptFile: byId("accept-file"),
    rejectFile: byId("reject-file"),
    transferStatus: byId("transfer-status"),
    transferLabel: byId("transfer-label"),
    transferPercent: byId("transfer-percent"),
    transferProgress: byId("transfer-progress"),
    transferDetail: byId("transfer-detail"),
    receivedFiles: byId("received-files"),
    cancelSession: byId("cancel-session"),
    globalStatus: byId("global-status"),
  };

  let role = null;
  let peer = null;
  let channel = null;
  let incomingOfferInfo = null;
  let incoming = null;
  let incomingQueue = Promise.resolve();
  let pendingDecision = null;
  let pendingCompletion = null;
  let sending = false;
  let cancelled = false;
  let activeWriter = null;
  const temporaryUrls = new Set();

  const formatBytes = (value) => {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "Taille inconnue";
    if (bytes === 0) return "0 octet";
    const units = ["octets", "Ko", "Mo", "Go", "To"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const amount = bytes / 1024 ** index;
    return `${amount >= 10 || index === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[index]}`;
  };

  function status(message, kind = "") {
    ui.globalStatus.textContent = message;
    ui.globalStatus.dataset.kind = kind;
  }

  function setConnection(label, detail = "", state = "waiting") {
    ui.connectionPanel.hidden = false;
    ui.connectionTitle.textContent = label;
    ui.connectionDetail.textContent = detail;
    ui.connectionLight.classList.toggle("is-connected", state === "connected");
    ui.connectionLight.classList.toggle("is-error", state === "error");
    ui.support.textContent = state === "connected" ? "RELAIS CONNECTÉ" : state === "error" ? "CONNEXION À VÉRIFIER" : "EN ATTENTE DU RELAIS";
  }

  function setRole(nextRole) {
    role = nextRole;
    ui.rolePicker.hidden = true;
    document.querySelectorAll("[data-role]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.role === nextRole));
    });
    ui.sendSetup.hidden = nextRole !== "send";
    ui.receiveSetup.hidden = nextRole !== "receive";
    ui.connectionPanel.hidden = true;
    status(nextRole === "send" ? "Choisissez les fichiers à partager depuis cet appareil." : "Collez le code temporaire de l’expéditeur.");
  }

  function bytesToBase64Url(bytes) {
    let binary = "";
    const step = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += step) {
      binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + step, bytes.length)));
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
  }

  function base64UrlToBytes(value) {
    const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function makeCode(type, sdp) {
    const payload = {
      v: 1,
      t: type,
      s: sdp,
      e: Date.now() + CODE_LIFETIME_MS,
    };
    return CODE_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  }

  function readCode(raw, expectedType) {
    const code = String(raw || "").trim();
    if (code.length > 100_000 || !code.startsWith(CODE_PREFIX)) {
      throw new Error("Ce code ne ressemble pas à un code KITT Relais. Vérifiez le copier-coller.");
    }
    let payload;
    try {
      payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(code.slice(CODE_PREFIX.length))));
    } catch {
      throw new Error("Le code est incomplet ou illisible. Demandez à l’expéditeur d’en créer un nouveau.");
    }
    if (payload?.v !== 1 || payload?.t !== expectedType || typeof payload?.s !== "string" || payload.s.length < 30) {
      throw new Error("Le code n’est pas une offre ou réponse KITT Relais valide.");
    }
    if (!Number.isFinite(payload.e) || payload.e < Date.now()) {
      throw new Error("Ce code de connexion a expiré. Créez une nouvelle session.");
    }
    return payload;
  }

  function waitForIceGathering(connection) {
    if (connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("La préparation du réseau a pris trop longtemps. Réessayez sur un réseau local stable."));
      }, 20_000);
      const onStateChange = () => {
        if (connection.iceGatheringState === "complete") {
          cleanup();
          resolve();
        }
      };
      const cleanup = () => {
        clearTimeout(timeout);
        connection.removeEventListener("icegatheringstatechange", onStateChange);
      };
      connection.addEventListener("icegatheringstatechange", onStateChange);
    });
  }

  function ensureWebRtcSupport() {
    if (!window.isSecureContext) throw new Error("Ouvrez cette page en HTTPS ou sur localhost pour utiliser les connexions directes.");
    if (typeof RTCPeerConnection !== "function") throw new Error("Ce navigateur ne prend pas en charge WebRTC. Essayez une version récente d’Edge, Chrome, Firefox ou Safari.");
  }

  function createPeer() {
    // Pas de serveur STUN/TURN : cette bêta tente uniquement une liaison directe
    // entre adresses candidates du réseau local, sans envoyer de métadonnées à un relais tiers.
    const connection = new RTCPeerConnection({ iceServers: [], iceCandidatePoolSize: 0 });
    connection.addEventListener("connectionstatechange", () => {
      if (connection.connectionState === "connected") {
        setConnection("APPAREILS RELIÉS", "La liaison directe est établie. Le destinataire choisira quoi accepter.", "connected");
        status("Connexion directe prête. Les fichiers ne sont pas envoyés au serveur du site.", "success");
      } else if (["failed", "disconnected"].includes(connection.connectionState)) {
        setConnection("LIAISON INTERROMPUE", "Vérifiez que les deux appareils peuvent communiquer sur le même réseau.", "error");
      }
    });
    connection.addEventListener("iceconnectionstatechange", () => {
      if (connection.iceConnectionState === "failed") {
        setConnection("CONNEXION BLOQUÉE PAR LE RÉSEAU", "Certains réseaux invités ou routeurs isolent les appareils. Essayez un réseau local qui autorise leur communication.", "error");
      }
    });
    return connection;
  }

  function attachChannel(dataChannel) {
    channel = dataChannel;
    channel.binaryType = "arraybuffer";
    channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
    channel.addEventListener("open", () => {
      setConnection("APPAREILS RELIÉS", "La liaison directe est établie. Le destinataire choisira quoi accepter.", "connected");
      if (role === "send") ui.sendSelected.hidden = false;
      status("Canal pair-à-pair prêt. Sélectionnez les fichiers à envoyer.", "success");
    });
    channel.addEventListener("close", () => {
      if (!cancelled) setConnection("SESSION TERMINÉE", "Le canal de transfert est fermé.", "waiting");
    });
    channel.addEventListener("error", () => setConnection("ERREUR DE LIAISON", "La connexion a rencontré une erreur. Terminez la session et recommencez.", "error"));
    channel.addEventListener("message", (event) => {
      incomingQueue = incomingQueue.then(() => handleMessage(event.data)).catch((error) => {
        status(error instanceof Error ? error.message : "Erreur pendant la réception.", "error");
      });
    });
  }

  function waitForPeerReply(kind, fileId, timeoutMs = 10 * 60 * 1000) {
    return new Promise((resolve, reject) => {
      const isDecision = kind === "decision";
      if (isDecision ? pendingDecision : pendingCompletion) {
        reject(new Error("Un autre transfert est déjà en attente."));
        return;
      }
      const timer = window.setTimeout(() => {
        if (isDecision && pendingDecision?.fileId === fileId) pendingDecision = null;
        if (!isDecision && pendingCompletion?.fileId === fileId) pendingCompletion = null;
        reject(new Error("L’autre appareil n’a pas répondu à temps."));
      }, timeoutMs);
      const pending = {
        fileId,
        resolve(value) {
          clearTimeout(timer);
          if (isDecision && pendingDecision === pending) pendingDecision = null;
          if (!isDecision && pendingCompletion === pending) pendingCompletion = null;
          resolve(value);
        },
        reject(error) {
          clearTimeout(timer);
          if (isDecision && pendingDecision === pending) pendingDecision = null;
          if (!isDecision && pendingCompletion === pending) pendingCompletion = null;
          reject(error);
        },
      };
      if (isDecision) pendingDecision = pending;
      else pendingCompletion = pending;
    });
  }

  function settlePeerReply(message) {
    const pending = message.type === "accepted" || message.type === "refused" ? pendingDecision : message.type === "complete" ? pendingCompletion : null;
    if (!pending || pending.fileId !== message.id) return false;
    if (message.type === "accepted") pending.resolve("accepted");
    else if (message.type === "refused") pending.resolve("refused");
    else if (message.type === "complete") pending.resolve("complete");
    return true;
  }

  function sendControl(message) {
    if (!channel || channel.readyState !== "open") throw new Error("La connexion est fermée.");
    channel.send(JSON.stringify(message));
  }

  function sanitizeFileName(value) {
    const cleaned = String(value || "fichier")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 180);
    return cleaned || "fichier";
  }

  function renderIncomingPrompt(file) {
    ui.incomingName.textContent = sanitizeFileName(file.name);
    ui.incomingMeta.textContent = `${formatBytes(file.size)}${file.type ? ` · ${file.type}` : ""}`;
    ui.incomingCard.hidden = false;
    ui.acceptFile.disabled = false;
    ui.rejectFile.disabled = false;
    ui.acceptFile.focus({ preventScroll: true });
  }

  async function chooseIncomingDestination(file) {
    let writable = null;
    if (typeof window.showSaveFilePicker === "function") {
      const handle = await window.showSaveFilePicker({ suggestedName: sanitizeFileName(file.name) });
      writable = await handle.createWritable();
    } else if (file.size > MAX_BLOB_FALLBACK) {
      throw new Error(`Ce navigateur ne permet pas l’enregistrement progressif des gros fichiers. Limite de réception sur cet appareil : ${formatBytes(MAX_BLOB_FALLBACK)}.`);
    }
    return writable;
  }

  async function acceptIncoming() {
    if (!incomingOfferInfo || !channel || channel.readyState !== "open") return;
    const offer = incomingOfferInfo;
    ui.acceptFile.disabled = true;
    ui.rejectFile.disabled = true;
    let writable;
    try {
      writable = await chooseIncomingDestination(offer);
    } catch (error) {
      ui.acceptFile.disabled = false;
      ui.rejectFile.disabled = false;
      if (error?.name === "AbortError") {
        status("Choix d’emplacement annulé. Le fichier n’a pas été accepté.");
      } else {
        status(error instanceof Error ? error.message : "Impossible d’ouvrir le sélecteur de fichier.", "error");
      }
      return;
    }
    incoming = { ...offer, chunks: [], received: 0, writable };
    activeWriter = writable;
    incomingOfferInfo = null;
    ui.incomingCard.hidden = true;
    ui.transferStatus.hidden = false;
    ui.transferLabel.textContent = "Réception en cours";
    ui.transferProgress.value = 0;
    ui.transferPercent.textContent = "0 %";
    ui.transferDetail.textContent = writable ? "Enregistrement direct vers l’emplacement choisi." : `Réception temporaire en mémoire · limite ${formatBytes(MAX_BLOB_FALLBACK)}.`;
    sendControl({ type: "accepted", id: offer.id });
    status("Fichier accepté. Le transfert commence.", "success");
  }

  function rejectIncoming() {
    if (!incomingOfferInfo || !channel || channel.readyState !== "open") return;
    sendControl({ type: "refused", id: incomingOfferInfo.id });
    incomingOfferInfo = null;
    ui.incomingCard.hidden = true;
    status("Le fichier a été refusé. Aucun contenu n’a été enregistré.");
  }

  async function finishIncoming() {
    if (!incoming) throw new Error("Aucun fichier n’est accepté.");
    if (incoming.received !== incoming.size) throw new Error("Le fichier reçu ne correspond pas à la taille annoncée. Le transfert a été arrêté.");
    const finished = incoming;
    if (finished.writable) {
      await finished.writable.close();
      activeWriter = null;
      sendControl({ type: "complete", id: finished.id });
      addReceivedRecord(finished.name, finished.size, null, "Fichier enregistré à l’emplacement choisi.");
    } else {
      const blob = new Blob(finished.chunks, { type: finished.type || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      temporaryUrls.add(url);
      addReceivedRecord(finished.name, finished.size, url, "Téléchargez le fichier pour le conserver.");
      sendControl({ type: "complete", id: finished.id });
    }
    incoming = null;
    ui.transferStatus.hidden = true;
    status("Réception terminée. Vous pouvez accepter un autre fichier ou terminer la session.", "success");
  }

  function addReceivedRecord(name, size, url, note) {
    const row = document.createElement("div");
    row.className = "received-file";
    const title = document.createElement("strong");
    title.textContent = sanitizeFileName(name);
    const detail = document.createElement("span");
    detail.textContent = `${formatBytes(size)} · ${note}`;
    row.append(title, detail);
    if (url) {
      const link = document.createElement("a");
      link.href = url;
      link.download = sanitizeFileName(name);
      link.textContent = "Télécharger";
      row.append(link);
    }
    ui.receivedFiles.append(row);
  }

  async function handleMessage(data) {
    if (typeof data !== "string") {
      await handleIncomingChunk(data);
      return;
    }
    let message;
    try { message = JSON.parse(data); }
    catch { throw new Error("Message de transfert illisible."); }
    if (role === "send" && settlePeerReply(message)) return;
    if (message.type === "cancel") {
      status("L’autre appareil a terminé la session.");
      terminateSession(false);
      return;
    }
    if (message.type === "file") {
      if (role !== "receive" || incoming || incomingOfferInfo) {
        sendControl({ type: "refused", id: message.id });
        return;
      }
      if (typeof message.id !== "string" || message.id.length > 80 || typeof message.name !== "string" || !Number.isFinite(message.size) || message.size < 0 || message.size > MAX_ACCEPTED_SIZE) {
        sendControl({ type: "refused", id: String(message.id || "invalid") });
        status("Une demande de fichier invalide ou trop volumineuse a été rejetée.", "error");
        return;
      }
      incomingOfferInfo = {
        id: message.id,
        name: sanitizeFileName(message.name),
        size: message.size,
        type: typeof message.mime === "string" ? message.mime.slice(0, 120) : "application/octet-stream",
      };
      renderIncomingPrompt(incomingOfferInfo);
      status("L’expéditeur attend votre décision. Aucun octet de fichier ne sera envoyé avant votre acceptation.");
      return;
    }
    if (message.type === "end" && incoming?.id === message.id) {
      await finishIncoming();
      return;
    }
    if (message.type === "cancel-file" && incoming?.id === message.id) {
      if (incoming.writable) await incoming.writable.abort().catch(() => {});
      activeWriter = null;
      incoming = null;
      ui.transferStatus.hidden = true;
      status("L’expéditeur a annulé ce fichier.");
      return;
    }
    if (message.type === "cancel") return;
    if (message.type === "accepted" || message.type === "refused" || message.type === "complete") {
      settlePeerReply(message);
    }
  }

  async function handleIncomingChunk(raw) {
    if (!incoming) throw new Error("Données reçues sans acceptation du destinataire.");
    const buffer = raw instanceof ArrayBuffer ? raw : raw instanceof Blob ? await raw.arrayBuffer() : null;
    if (!buffer) throw new Error("Format de fichier reçu non pris en charge.");
    const bytes = new Uint8Array(buffer);
    if (incoming.received + bytes.byteLength > incoming.size) throw new Error("Les données reçues dépassent la taille annoncée. Session interrompue.");
    if (incoming.writable) await incoming.writable.write(bytes);
    else incoming.chunks.push(bytes);
    incoming.received += bytes.byteLength;
    const percent = incoming.size ? Math.min(100, Math.round((incoming.received / incoming.size) * 100)) : 100;
    ui.transferProgress.value = percent;
    ui.transferPercent.textContent = `${percent} %`;
    ui.transferDetail.textContent = `${formatBytes(incoming.received)} / ${formatBytes(incoming.size)}`;
  }

  function waitForLowBuffer(dataChannel) {
    if (dataChannel.bufferedAmount <= BUFFER_HIGH_WATER) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Le réseau ne vide pas le tampon assez vite. Terminez la session et réessayez."));
      }, 30_000);
      const onLow = () => { cleanup(); resolve(); };
      const onClose = () => { cleanup(); reject(new Error("La connexion s’est fermée pendant l’envoi.")); };
      const cleanup = () => {
        clearTimeout(timeout);
        dataChannel.removeEventListener("bufferedamountlow", onLow);
        dataChannel.removeEventListener("close", onClose);
      };
      dataChannel.addEventListener("bufferedamountlow", onLow);
      dataChannel.addEventListener("close", onClose);
    });
  }

  async function transmitFiles(fileList) {
    if (sending || !channel || channel.readyState !== "open") return;
    const files = Array.from(fileList || []);
    if (!files.length) {
      status("Choisissez au moins un fichier à envoyer.", "error");
      return;
    }
    sending = true;
    cancelled = false;
    ui.sendSelected.disabled = true;
    const batchBytes = files.reduce((total, file) => total + file.size, 0);
    let completedBytes = 0;
    ui.transferStatus.hidden = false;
    try {
      for (const file of files) {
        if (cancelled || !channel || channel.readyState !== "open") throw new Error("L’envoi a été arrêté.");
        const id = `${Date.now().toString(36)}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
        ui.transferLabel.textContent = `En attente de l’accord · ${sanitizeFileName(file.name)}`;
        ui.transferProgress.value = batchBytes ? Math.round((completedBytes / batchBytes) * 100) : 0;
        ui.transferPercent.textContent = `${ui.transferProgress.value} %`;
        ui.transferDetail.textContent = `${formatBytes(file.size)} · l’autre appareil doit accepter ce fichier.`;
        const decision = waitForPeerReply("decision", id);
        try {
          sendControl({ type: "file", id, name: sanitizeFileName(file.name), size: file.size, mime: file.type || "application/octet-stream" });
        } catch (error) {
          pendingDecision?.reject(error);
        }
        if (await decision !== "accepted") throw new Error(`Le destinataire a refusé « ${sanitizeFileName(file.name)} ».`);
        const complete = waitForPeerReply("completion", id);
        ui.transferLabel.textContent = `Envoi · ${sanitizeFileName(file.name)}`;
        for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
          if (cancelled || !channel || channel.readyState !== "open") throw new Error("L’envoi a été arrêté.");
          await waitForLowBuffer(channel);
          const chunk = await file.slice(offset, Math.min(offset + CHUNK_BYTES, file.size)).arrayBuffer();
          channel.send(chunk);
          const sent = Math.min(offset + chunk.byteLength, file.size);
          const totalPercent = batchBytes ? Math.round(((completedBytes + sent) / batchBytes) * 100) : 100;
          ui.transferProgress.value = totalPercent;
          ui.transferPercent.textContent = `${totalPercent} %`;
          ui.transferDetail.textContent = `${formatBytes(sent)} / ${formatBytes(file.size)} · ${files.length > 1 ? `${formatBytes(completedBytes + sent)} / ${formatBytes(batchBytes)} au total` : ""}`;
        }
        sendControl({ type: "end", id });
        await complete;
        completedBytes += file.size;
      }
      ui.transferLabel.textContent = "Envoi terminé";
      ui.transferProgress.value = 100;
      ui.transferPercent.textContent = "100 %";
      ui.transferDetail.textContent = `${files.length} fichier${files.length === 1 ? "" : "s"} transféré${files.length === 1 ? "" : "s"}.`;
      status("Tous les fichiers acceptés ont été envoyés.", "success");
    } catch (error) {
      status(error instanceof Error ? error.message : "Erreur pendant l’envoi.", "error");
    } finally {
      sending = false;
      ui.sendSelected.disabled = false;
      ui.sendFilesInput.value = "";
      ui.selectedFiles.textContent = "Aucun fichier sélectionné.";
    }
  }

  async function waitForAnswerCreation(connection) {
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await waitForIceGathering(connection);
    if (!connection.localDescription?.sdp?.includes("a=candidate:")) {
      throw new Error("Aucune adresse de connexion locale n’a été trouvée. Vérifiez que le navigateur autorise WebRTC sur ce réseau.");
    }
    return connection.localDescription.sdp;
  }

  async function createOffer() {
    try {
      ensureWebRtcSupport();
      if (!ui.sendFilesInput.files?.length) throw new Error("Choisissez d’abord les fichiers que vous voulez envoyer.");
      ui.createOffer.disabled = true;
      status("Préparation d’une connexion directe locale…");
      peer = createPeer();
      attachChannel(peer.createDataChannel("kitt-relay", { ordered: true }));
      const sdp = await waitForAnswerCreation(peer);
      ui.offerCode.value = makeCode("offer", sdp);
      ui.offerPanel.hidden = false;
      ui.connectionPanel.hidden = false;
      ui.connectionTitle.textContent = "EN ATTENTE DE L’APPAREIL DESTINATAIRE";
      ui.connectionDetail.textContent = "Copiez le code sur l’autre appareil, puis collez ici sa réponse.";
      ui.support.textContent = "CODE TEMPORAIRE CRÉÉ";
      status("Code créé. Transmettez-le en privé à votre autre appareil.", "success");
      ui.offerCode.focus({ preventScroll: true });
    } catch (error) {
      terminatePeerOnly();
      status(error instanceof Error ? error.message : "Impossible de créer la connexion.", "error");
    } finally {
      ui.createOffer.disabled = false;
    }
  }

  async function createAnswer() {
    try {
      ensureWebRtcSupport();
      const offer = readCode(ui.incomingOffer.value, "offer");
      ui.createAnswer.disabled = true;
      status("Préparation de la réponse sur ce réseau local…");
      peer = createPeer();
      peer.addEventListener("datachannel", (event) => attachChannel(event.channel), { once: true });
      await peer.setRemoteDescription({ type: "offer", sdp: offer.s });
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await waitForIceGathering(peer);
      if (!peer.localDescription?.sdp?.includes("a=candidate:")) {
        throw new Error("Aucune adresse locale n’a été trouvée pour préparer la réponse.");
      }
      ui.localAnswer.value = makeCode("answer", peer.localDescription.sdp);
      ui.answerPanel.hidden = false;
      ui.connectionPanel.hidden = false;
      ui.connectionTitle.textContent = "RÉPONSE PRÊTE · CONNEXION EN COURS";
      ui.connectionDetail.textContent = "Renvoyez le code à l’expéditeur et gardez cette page ouverte.";
      ui.support.textContent = "RÉPONSE LOCALE CRÉÉE";
      status("Réponse créée. La connexion sera active après validation par l’expéditeur.", "success");
      ui.localAnswer.focus({ preventScroll: true });
    } catch (error) {
      terminatePeerOnly();
      status(error instanceof Error ? error.message : "Impossible de préparer cette réponse.", "error");
    } finally {
      ui.createAnswer.disabled = false;
    }
  }

  async function applyAnswer() {
    try {
      if (!peer) throw new Error("Créez d’abord un code de connexion.");
      const answer = readCode(ui.answerCode.value, "answer");
      ui.applyAnswer.disabled = true;
      await peer.setRemoteDescription({ type: "answer", sdp: answer.s });
      setConnection("CONNEXION EN COURS", "Attendez que les deux appareils terminent la liaison.", "waiting");
      status("Réponse validée. Le canal direct se met en place.");
    } catch (error) {
      status(error instanceof Error ? error.message : "Impossible de valider la réponse.", "error");
    } finally {
      ui.applyAnswer.disabled = false;
    }
  }

  function terminatePeerOnly() {
    try { channel?.close(); } catch { /* déjà fermé */ }
    try { peer?.close(); } catch { /* déjà fermé */ }
    channel = null;
    peer = null;
  }

  async function terminateSession(notifyPeer = true) {
    cancelled = true;
    if (notifyPeer && channel?.readyState === "open") {
      try { sendControl({ type: "cancel" }); } catch { /* connexion déjà fermée */ }
    }
    try { await activeWriter?.abort(); } catch { /* le fichier peut déjà être fermé */ }
    activeWriter = null;
    incoming = null;
    incomingOfferInfo = null;
    pendingDecision?.reject(new Error("Session terminée."));
    pendingCompletion?.reject(new Error("Session terminée."));
    pendingDecision = null;
    pendingCompletion = null;
    terminatePeerOnly();
    temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
    temporaryUrls.clear();
    ui.rolePicker.hidden = false;
    ui.sendSetup.hidden = true;
    ui.receiveSetup.hidden = true;
    ui.offerPanel.hidden = true;
    ui.answerPanel.hidden = true;
    ui.connectionPanel.hidden = true;
    ui.incomingCard.hidden = true;
    ui.transferStatus.hidden = true;
    ui.receivedFiles.replaceChildren();
    ui.sendFilesInput.value = "";
    ui.selectedFiles.textContent = "Aucun fichier sélectionné.";
    ui.offerCode.value = "";
    ui.answerCode.value = "";
    ui.incomingOffer.value = "";
    ui.localAnswer.value = "";
    document.querySelectorAll("[data-role]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    role = null;
    sending = false;
    cancelled = false;
    ui.support.textContent = "PRÊT À CONNECTER";
    status(notifyPeer ? "Session terminée. Les codes et données de cette page ont été effacés." : "L’autre appareil a fermé la session. Les données temporaires ont été effacées.");
  }

  async function copyCode(textareaId, statusId) {
    const input = byId(textareaId);
    const target = byId(statusId);
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      target.textContent = "Code copié.";
    } catch {
      input.focus();
      input.select();
      target.textContent = "Code sélectionné. Copiez-le avec Ctrl+C ou ⌘C.";
    }
  }

  document.querySelectorAll("[data-role]").forEach((button) => button.addEventListener("click", () => setRole(button.dataset.role)));
  ui.createOffer.addEventListener("click", createOffer);
  ui.createAnswer.addEventListener("click", createAnswer);
  ui.applyAnswer.addEventListener("click", applyAnswer);
  ui.acceptFile.addEventListener("click", acceptIncoming);
  ui.rejectFile.addEventListener("click", rejectIncoming);
  ui.sendSelected.addEventListener("click", () => transmitFiles(ui.sendFilesInput.files));
  ui.cancelSession.addEventListener("click", () => terminateSession(true));
  ui.sendFilesInput.addEventListener("change", () => {
    const files = Array.from(ui.sendFilesInput.files || []);
    if (!files.length) {
      ui.selectedFiles.textContent = "Aucun fichier sélectionné.";
      ui.createOffer.disabled = true;
      return;
    }
    const total = files.reduce((sum, file) => sum + file.size, 0);
    const names = files.slice(0, 3).map((file) => sanitizeFileName(file.name)).join(" · ");
    const remaining = files.length > 3 ? ` · +${files.length - 3} autre${files.length > 4 ? "s" : ""}` : "";
    ui.selectedFiles.textContent = `${files.length} fichier${files.length === 1 ? "" : "s"} · ${formatBytes(total)} · ${names}${remaining}`;
    ui.createOffer.disabled = false;
  });
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", () => {
      const copyStatus = button.dataset.copy === "offer-code" ? "offer-copy-status" : "answer-copy-status";
      copyCode(button.dataset.copy, copyStatus);
    });
  });

  window.addEventListener("pagehide", () => {
    try { channel?.close(); } catch { /* page is closing */ }
    try { peer?.close(); } catch { /* page is closing */ }
    temporaryUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  if (!window.isSecureContext) {
    ui.support.textContent = "HTTPS REQUIS POUR WEBRTC";
    status("Ouvrez KITT Relais en HTTPS ou sur localhost. Les navigateurs bloquent les connexions WebRTC depuis une page HTTP ordinaire.", "error");
  }
})();
