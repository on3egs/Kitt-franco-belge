// VuMeter.qml - vumetre analogique a aiguille.
//
// L'aiguille est pilotee par une SpringAnimation : elle possede une vraie
// inertie physique (masse + amortissement), ce qui donne un mouvement vivant
// et realiste, interpole automatiquement a la frequence de l'ecran (GPU).
import QtQuick 2.15

Item {
    id: root

    property real level: 0.0          // cible 0..1, branchee sur l'audio
    property string label: "L"
    property color accent: "#ff3348"

    implicitWidth: 240
    implicitHeight: 210

    // Geometrie du cadran, partagee entre le dessin et l'aiguille.
    readonly property real cx: width / 2
    readonly property real cy: height * 0.84
    readonly property real rad: Math.min(width * 0.40, height * 0.60)

    // Valeur animee de l'aiguille : inertie ressort.
    property real needle: 0.0
    onLevelChanged: needle = Math.max(0, Math.min(1, level))
    Behavior on needle {
        SpringAnimation { spring: 4.2; damping: 0.26; mass: 0.5; epsilon: 0.001 }
    }

    // Maintien de crete : saute vers le haut, redescend lentement.
    property real peak: 0.0
    onNeedleChanged: if (needle > peak) peak = needle
    Behavior on peak { NumberAnimation { duration: 1100; easing.type: Easing.InCubic } }
    Timer {
        interval: 110; running: true; repeat: true
        onTriggered: if (root.peak > root.needle) root.peak = root.needle
    }

    // Fond du cadran.
    Rectangle {
        anchors.fill: parent
        radius: 6
        color: "#070809"
        border.color: "#341017"
        border.width: 1
    }

    // Arc et graduations : dessines une seule fois, mis en cache par le GPU.
    Canvas {
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            var cx = root.cx, cy = root.cy, r = root.rad;
            var a0 = -142 * Math.PI / 180;
            var a1 = -38 * Math.PI / 180;

            ctx.lineWidth = 3;
            ctx.strokeStyle = "#46505d";
            ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, false); ctx.stroke();

            // Zone rouge sur les derniers ~22 %.
            ctx.lineWidth = 4;
            ctx.strokeStyle = root.accent;
            var ar = (-142 + 0.78 * 104) * Math.PI / 180;
            ctx.beginPath(); ctx.arc(cx, cy, r, ar, a1, false); ctx.stroke();

            for (var i = 0; i <= 10; i++) {
                var a = (-142 + i * 10.4) * Math.PI / 180;
                var inner = r - (i % 5 === 0 ? 13 : 7);
                ctx.lineWidth = i % 5 === 0 ? 2.5 : 1.5;
                ctx.strokeStyle = i >= 8 ? root.accent : "#6b7682";
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                ctx.stroke();
            }
        }
    }

    // Marqueur de crete, glisse le long de l'arc.
    Rectangle {
        width: 7; height: 7; radius: 3.5
        color: "#ffffff"
        opacity: 0.9
        property real pa: (-142 + root.peak * 104) * Math.PI / 180
        x: root.cx + Math.cos(pa) * root.rad - width / 2
        y: root.cy + Math.sin(pa) * root.rad - height / 2
    }

    // Aiguille.
    Rectangle {
        id: needleRect
        width: 3
        height: root.rad * 0.94
        x: root.cx - width / 2
        y: root.cy - height
        radius: 1.5
        antialiasing: true
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#ffe96b" }
            GradientStop { position: 1.0; color: root.accent }
        }
        transform: Rotation {
            origin.x: needleRect.width / 2
            origin.y: needleRect.height
            angle: -52 + root.needle * 104
        }
    }

    // Moyeu central avec lueur reactive au niveau.
    Rectangle {
        width: 14; height: 14; radius: 7
        x: root.cx - 7; y: root.cy - 7
        color: root.accent
        border.color: "#1a0307"
        border.width: 2
        Rectangle {
            anchors.centerIn: parent
            width: parent.width + 12; height: width; radius: width / 2
            color: "transparent"
            border.color: root.accent
            border.width: 2
            opacity: root.needle * 0.55
        }
    }

    // Etiquette du canal.
    Text {
        x: 13; y: 11
        text: root.label
        color: "#d8dde2"
        font.family: "DejaVu Sans Mono"
        font.pixelSize: 13
        font.bold: true
    }
    // Lecture du niveau en decibels.
    Text {
        anchors {
            right: parent.right; rightMargin: 13
            top: parent.top; topMargin: 11
        }
        text: Math.round(-48 + root.needle * 48) + " dB"
        color: "#ffe96b"
        font.family: "DejaVu Sans Mono"
        font.pixelSize: 11
        font.bold: true
    }
}
