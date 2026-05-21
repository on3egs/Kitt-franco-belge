// Oscilloscope.qml - visualiseur style oscilloscope analogique Pioneer / CRT.
//
// Deux traces (L / R) dessinees sur ecran CRT avec grille, phosphore persistant
// et modulation par les niveaux audio (basses, mediums, aigus, vu-meters).
// Entierement procedurale, acceleree GPU via Canvas.
import QtQuick 2.15

Item {
    id: root

    // Niveaux audio branches depuis le Player.
    property real vuLeft: 0.0
    property real vuRight: 0.0
    property real bass: 0.0
    property real mid: 0.0
    property real treble: 0.0

    property color traceL: "#35e6ff"   // cyan pour L
    property color traceR: "#ff5b69"   // rouge soft pour R
    property color gridColor: "#1a3a2a"
    property color phosphor: "#54e36b" // vert phosphore

    implicitHeight: 90

    // Temps interne pour l'animation des ondes.
    property real t: 0.0
    Timer {
        interval: 16; running: true; repeat: true
        onTriggered: root.t += 0.016
    }

    // --- Ecran CRT avec grille ---
    Rectangle {
        anchors.fill: parent
        color: "#020304"
        border.color: "#1a1e24"
        border.width: 1
        radius: 6

        // Grille oscilloscope
        Canvas {
            id: gridCanvas
            anchors.fill: parent
            anchors.margins: 1
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                ctx.lineWidth = 0.8;
                ctx.strokeStyle = root.gridColor;
                var stepX = width / 12;
                var stepY = height / 6;
                for (var x = stepX; x < width; x += stepX) {
                    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
                }
                for (var y = stepY; y < height; y += stepY) {
                    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
                }
                // Ligne centrale plus visible
                ctx.strokeStyle = "#2a5a3a";
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2);
                ctx.stroke();
            }
        }

        // Scanlines CRT
        Canvas {
            anchors.fill: parent
            opacity: 0.06
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                for (var y = 0; y < height; y += 2) {
                    ctx.fillStyle = "#000000";
                    ctx.fillRect(0, y, width, 1);
                }
            }
        }

        // Reflet courbe ecran CRT
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            color: "transparent"
            border.color: Qt.rgba(1, 1, 1, 0.03)
            border.width: 1
        }
    }

    // --- Traces oscilloscope ---
    Canvas {
        id: scopeCanvas
        anchors.fill: parent
        anchors.margins: 2

        Timer {
            interval: 16; running: true; repeat: true
            onTriggered: parent.requestPaint()
        }

        onPaint: {
            var ctx = getContext("2d");
            var w = width, h = height;
            var cy = h / 2;
            var dt = root.t * 8.0;  // vitesse de balayage

            // Amplitudes modules par les niveaux audio
            var aBass = 0.15 + root.bass * 0.55;
            var aMid = 0.08 + root.mid * 0.35;
            var aTreble = 0.04 + root.treble * 0.20;
            var aL = 0.1 + root.vuLeft * 0.5;
            var aR = 0.1 + root.vuRight * 0.5;

            // Bruit subtil quand pas de son
            var noiseL = (root.vuLeft < 0.02) ? 0.3 : 0.05;
            var noiseR = (root.vuRight < 0.02) ? 0.3 : 0.05;

            // --- Fonction d'onde pour un canal ---
            function wave(x, channel, amp) {
                var phase = channel === 0 ? 0 : 2.1;
                var px = x / w * 12.0;  // echelle horizontale
                var y = 0.0;

                // Basses : onde lente large
                y += Math.sin(px * 0.7 + dt * 0.6 + phase) * aBass;
                y += Math.sin(px * 1.3 + dt * 0.4 + phase * 1.5) * aBass * 0.5;

                // Mediums : onde moyenne
                y += Math.sin(px * 2.5 + dt * 1.2 + phase * 0.7) * aMid;
                y += Math.sin(px * 3.8 + dt * 0.9 + phase * 1.2) * aMid * 0.4;

                // Aigus : onde rapide fine
                y += Math.sin(px * 6.0 + dt * 2.5 + phase * 0.3) * aTreble;
                y += Math.sin(px * 9.5 + dt * 3.0 + phase * 1.8) * aTreble * 0.3;

                // Enveloppe VU (forme globale de l'onde)
                var env = Math.sin(px * 0.25 + dt * 0.15) * amp;
                y += env * 0.4;

                // Petites oscillations rapides style Lissajous quand le son est fort
                if (root.bass > 0.3) {
                    y += Math.sin(px * 4.0 + dt * 1.8) * Math.cos(dt * 0.3) * 0.12 * root.bass;
                }

                // Bruit analogique
                var n = channel === 0 ? noiseL : noiseR;
                y += (Math.random() - 0.5) * n * 0.15;

                return y * h * 0.38;
            }

            // --- Dessin d'une trace avec glow phosphore ---
            function drawTrace(channel, color, amp) {
                // Glow externe
                ctx.lineWidth = 5;
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.08;
                ctx.beginPath();
                for (var x = 0; x <= w; x += 1.5) {
                    var yy = cy + wave(x, channel, amp);
                    if (x === 0) ctx.moveTo(x, yy);
                    else ctx.lineTo(x, yy);
                }
                ctx.stroke();

                // Glow interne
                ctx.lineWidth = 3;
                ctx.globalAlpha = 0.18;
                ctx.beginPath();
                for (x = 0; x <= w; x += 1.5) {
                    yy = cy + wave(x, channel, amp);
                    if (x === 0) ctx.moveTo(x, yy);
                    else ctx.lineTo(x, yy);
                }
                ctx.stroke();

                // Trace principale
                ctx.lineWidth = 1.5;
                ctx.globalAlpha = 0.85;
                ctx.beginPath();
                for (x = 0; x <= w; x += 1.0) {
                    yy = cy + wave(x, channel, amp);
                    if (x === 0) ctx.moveTo(x, yy);
                    else ctx.lineTo(x, yy);
                }
                ctx.stroke();

                // Point lumineux au debut (style balayage CRT)
                var startY = cy + wave(0, channel, amp);
                ctx.globalAlpha = 0.6;
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.arc(2, startY, 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.globalAlpha = 1.0;
            }

            ctx.clearRect(0, 0, w, h);

            // Trace L (canal gauche)
            drawTrace(0, root.traceL, aL);

            // Trace R (canal droit) - decalage de phase
            drawTrace(1, root.traceR, aR);
        }
    }

    // --- Point lumineux de balayage (tete de lecture CRT) ---
    Rectangle {
        id: sweepDot
        width: 6; height: 6; radius: 3
        color: root.phosphor
        opacity: 0.7 + (root.vuLeft + root.vuRight) * 0.3
        y: parent.height / 2 - 3

        SequentialAnimation on x {
            loops: Animation.Infinite
            NumberAnimation { from: 2; to: root.width - 8; duration: 1200; easing.type: Easing.Linear }
            NumberAnimation { from: 2; to: 2; duration: 80 }
        }
        SequentialAnimation on opacity {
            loops: Animation.Infinite
            NumberAnimation { to: 0.3; duration: 600 }
            NumberAnimation { to: 0.9; duration: 600 }
        }
    }

    // --- Etiquettes ---
    Text {
        x: 8; y: 4
        text: "OSC L"
        color: root.traceL
        font.family: "DejaVu Sans Mono"; font.pixelSize: 8; font.bold: true
        opacity: 0.7
    }
    Text {
        anchors.right: parent.right; anchors.rightMargin: 8; y: 4
        text: "OSC R"
        color: root.traceR
        font.family: "DejaVu Sans Mono"; font.pixelSize: 8; font.bold: true
        opacity: 0.7
    }
}
