// Oscilloscope.qml - Oscilloscope double trace style Tektronix 465B.
//
// Grille réticule ambre, phosphore persistant, deux traces L/R,
// declenchement simule, verre bombe, aucun neon.
import QtQuick 2.15

Item {
    id: root
    implicitWidth: 170
    implicitHeight: 140

    property real vuLeft: 0.0
    property real vuRight: 0.0
    property real bass: 0.0
    property real mid: 0.0

    // Buffer circulaire d'echantillons simules
    property var bufL: []
    property var bufR: []
    property int bufSize: 128
    property int writePos: 0
    property real timeAcc: 0.0

    Component.onCompleted: {
        for (var i = 0; i < bufSize; i++) { bufL.push(0); bufR.push(0); }
    }

    // === CHASSIS ===
    Rectangle {
        anchors.fill: parent; radius: 6
        color: "#090a0c"; border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0e1014" }
            GradientStop { position: 0.5; color: "#090a0c" }
            GradientStop { position: 1.0; color: "#040508" }
        }
        Rectangle {
            anchors.fill: parent; anchors.margins: 1; radius: 5
            color: "transparent"; border.color: Qt.rgba(1,1,1,0.03); border.width: 1
        }
    }

    // === ECRAN NOIR PROFOND ===
    Rectangle {
        anchors.fill: parent; anchors.margins: 14
        color: "#020304"
        border.color: "#0d0f14"; border.width: 1; radius: 2
    }

    // === GRILLE RETICULE ===
    Canvas {
        anchors.fill: parent; anchors.margins: 14
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var w = width, h = height;
            ctx.strokeStyle = "#2a2518"; ctx.lineWidth = 0.5;
            // Lignes verticales (10 divisions)
            for (var i = 1; i < 10; i++) {
                var x = w * i / 10;
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
            }
            // Lignes horizontales (8 divisions)
            for (var j = 1; j < 8; j++) {
                var y = h * j / 8;
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
            }
            // Croix centrale
            ctx.strokeStyle = "#3a3020"; ctx.lineWidth = 0.8;
            var cx = w/2, cy = h/2;
            ctx.beginPath(); ctx.moveTo(cx-4, cy); ctx.lineTo(cx+4, cy); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, cy-4); ctx.lineTo(cx, cy+4); ctx.stroke();
        }
    }

    // === TRACES L/R ===
    Canvas {
        id: traceCanvas
        anchors.fill: parent; anchors.margins: 14
        Timer {
            interval: 33; running: true; repeat: true
            onTriggered: {
                // Generer echantillons simules
                var mix = (root.vuLeft + root.vuRight) * 0.5;
                var ampL = root.vuLeft * 0.85;
                var ampR = root.vuRight * 0.85;
                var freq = 2 + root.bass * 6 + root.mid * 3;
                root.timeAcc += 0.15 + mix * 0.3;
                var sL = Math.sin(root.timeAcc * freq + 0.0) * ampL + Math.sin(root.timeAcc * freq * 2.3) * ampL * 0.3;
                var sR = Math.sin(root.timeAcc * freq + 0.8) * ampR + Math.sin(root.timeAcc * freq * 1.7) * ampR * 0.3;
                root.bufL[root.writePos] = Math.max(-1, Math.min(1, sL));
                root.bufR[root.writePos] = Math.max(-1, Math.min(1, sR));
                root.writePos = (root.writePos + 1) % root.bufSize;
                traceCanvas.requestPaint();
            }
        }
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var w = width, h = height;
            var cy = h / 2;
            var scaleY = h * 0.38;

            // Trace L (vert phosphore)
            ctx.strokeStyle = "#54e36b"; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.85;
            ctx.beginPath();
            for (var i = 0; i < root.bufSize; i++) {
                var idx = (root.writePos + i) % root.bufSize;
                var x = w * i / (root.bufSize - 1);
                var y = cy - root.bufL[idx] * scaleY;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Trace R (ambre phosphore)
            ctx.strokeStyle = "#cc8820"; ctx.lineWidth = 1.0; ctx.globalAlpha = 0.7;
            ctx.beginPath();
            for (var i2 = 0; i2 < root.bufSize; i2++) {
                var idx2 = (root.writePos + i2) % root.bufSize;
                var x2 = w * i2 / (root.bufSize - 1);
                var y2 = cy - root.bufR[idx2] * scaleY;
                if (i2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
            }
            ctx.stroke();

            ctx.globalAlpha = 1.0;
        }
    }

    // === LABEL ===
    Text {
        anchors.top: parent.top; anchors.topMargin: 4
        anchors.horizontalCenter: parent.horizontalCenter
        text: "OSCILLOSCOPE"
        color: "#3a4050"; font.family: "DejaVu Sans Mono"
        font.pixelSize: 5; font.bold: true; opacity: 0.6
    }

    // === VERRE BOMBE ===
    Rectangle {
        anchors.fill: parent; anchors.margins: 3; radius: 4
        color: "transparent"
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(1,1,1,0.02) }
            GradientStop { position: 0.08; color: Qt.rgba(1,1,1,0.005) }
            GradientStop { position: 0.4; color: "transparent" }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }

    // AO peripherique
    Rectangle {
        anchors.fill: parent; radius: 6
        color: "transparent"; border.color: "#000000"; border.width: 5; opacity: 0.2
    }
}
