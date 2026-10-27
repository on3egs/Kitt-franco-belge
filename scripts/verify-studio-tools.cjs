const { chromium } = require(process.env.PLAYWRIGHT_PATH || "C:/Users/ON3EG/AppData/Local/Temp/kitt-cockpit-browser/node_modules/playwright");
const { PDFDocument } = require("pdf-lib");

const root = process.env.SITE_URL || "http://127.0.0.1:4173";

(async () => {
  const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  const page = await browser.newPage({ viewport: { width: 1360, height: 950 }, acceptDownloads: true });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));

  await page.goto(`${root}/outils`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(700);
  const dailyIds = await page.locator('[id="outils-quotidiens"]').count();
  if (dailyIds !== 1) throw new Error(`Expected one daily-tools anchor, found ${dailyIds}`);
  const visibleTools = await page.locator(".tool-card").count();
  if (visibleTools < 1) throw new Error("The tool catalog is empty.");

  await page.goto(`${root}/outils#outils-quotidiens`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: /Essayer un exemple/ }).click();
  if (await page.locator("#everyday-panel-table tbody tr").count() !== 4) throw new Error("CSV example row count changed.");
  await page.getByRole("searchbox", { name: "Filtrer les lignes du tableau" }).fill("serie limitee");
  if (await page.locator("#everyday-panel-table tbody tr").count() !== 2) throw new Error("CSV filter failed.");
  await page.getByLabel("Retirer les doublons identiques").check();
  if (await page.locator("#everyday-panel-table tbody tr").count() !== 1) throw new Error("CSV deduplication failed.");
  const csvDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Télécharger le CSV/ }).click();
  const csv = await csvDownloadPromise;
  await page.setViewportSize({ width: 390, height: 840 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error("The everyday tools overflow on mobile.");
  await page.getByRole("button", { name: /Générateur de mots de passe/ }).click();
  await page.getByRole("button", { name: "Générer", exact: true }).click();
  const password = await page.getByLabel("Mot de passe généré").inputValue();
  if (password.length !== 24) throw new Error("The generated password has an unexpected length.");

  const firstSource = await PDFDocument.create();
  for (const label of ["A-01", "A-02"]) firstSource.addPage().drawText(label, { x: 55, y: 700 });
  const secondSource = await PDFDocument.create();
  secondSource.addPage().drawText("B-01", { x: 55, y: 700 });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${root}/studio-pdf`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type=file][accept="application/pdf,.pdf"]').setInputFiles([
    { name: "source-a.pdf", mimeType: "application/pdf", buffer: Buffer.from(await firstSource.save()) },
    { name: "source-b.pdf", mimeType: "application/pdf", buffer: Buffer.from(await secondSource.save()) },
  ]);
  await page.getByRole("heading", { name: /3 page/ }).waitFor({ timeout: 20000 });
  if (await page.locator(".ps-page").count() !== 3) throw new Error("PDF thumbnails failed to load.");
  await page.getByLabel("Sélectionner la page 2").check();
  await page.getByRole("button", { name: "Retirer", exact: true }).click();
  if (await page.locator(".ps-page").count() !== 2) throw new Error("PDF page removal failed.");
  await page.getByRole("button", { name: "Annuler" }).click();
  if (await page.locator(".ps-page").count() !== 3) throw new Error("PDF undo failed.");
  await page.getByLabel("Sélectionner la page 1").check();
  await page.getByRole("button", { name: "Tourner de 90°" }).click();
  await page.getByLabel("Nom du fichier").fill("mon-dossier");
  const pdfDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Télécharger mon PDF/ }).click();
  const pdfDownload = await pdfDownloadPromise;
  if (pdfDownload.suggestedFilename() !== "mon-dossier.pdf") throw new Error("PDF filename is wrong.");
  const output = await PDFDocument.load(require("node:fs").readFileSync(await pdfDownload.path()));
  if (output.getPageCount() !== 3 || output.getPage(0).getRotation().angle !== 90) throw new Error("PDF export pages or orientation are wrong.");
  await page.setViewportSize({ width: 390, height: 840 });
  await page.goto(`${root}/studio-pdf`, { waitUntil: "domcontentloaded" });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error("PDF studio overflows on mobile.");
  if (errors.length) throw new Error(`Uncaught browser errors: ${errors.join("; ")}`);
  console.log(JSON.stringify({ success: true, visibleTools, dailyIds, csv: { filter: "PASS", deduplicate: "PASS", download: csv.suggestedFilename() }, passwordLength: password.length, pdf: { pages: output.getPageCount(), rotation: output.getPage(0).getRotation().angle, removeAndUndo: "PASS", download: pdfDownload.suggestedFilename() }, mobile390: "PASS", errors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
