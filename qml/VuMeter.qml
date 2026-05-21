// VuMeter.qml - vumetre analogique premium style hi-fi annees 80.
//
// Cadran avec 100 micro-graduations, eclairage incandescent ambre,
// biseaute profondeur, aiguille avec ombre et glow chaud.
import QtQuick 2.15

Item {
    id: root

    property real level: 0.0
    property string label: "L"
    property color accent: "#ff3348"

    implicitWidth: 280
    implicitHeight: 230

    readonly property real cx: width / 2
    readonly property real cy: height * 0.74 + 20
    readonly property real rad: Math.min(width * 0.54, height * 0.76)

    // Cible brute issue de l'analyse audio (0..1).
    property real target: 0.0
    onLevelChanged: target = Math.max(0, Math.min(1, level))

    // Position animee de l'aiguille. Balistique ASYMETRIQUE, facon vumetre
    // reel : attaque rapide (~70 ms : l'aiguille claque sur le beat), retombee
    // plus douce (~270 ms : elle redescend entre deux beats) -> elle suit le
    // tempo. L'ancien SpringAnimation avait une periode propre de ~1,9 s :
    // bien trop lent pour un rythme musical, l'aiguille flottait au lieu de
    // pulser.
    property real needle: 0.0
    Timer {
        interval: 16; running: true; repeat: true   // ~60 images/s
        onTriggered: {
            var diff = root.target - root.needle;
            if (Math.abs(diff) < 0.0006) {
                root.needle = root.target;
            } else {
                root.needle += diff * (diff > 0 ? 0.50 : 0.16);
            }
        }
    }

    property real peak: 0.0
    onNeedleChanged: if (needle > peak) peak = needle
    Behavior on peak { NumberAnimation { duration: 900; easing.type: Easing.InCubic } }
    Timer {
        interval: 90; running: true; repeat: true
        onTriggered: if (root.peak > root.needle) root.peak = root.needle
    }

    readonly property real needleAngle: -52 + root.needle * 104
    readonly property real peakAngle: -52 + root.peak * 104

    // --- CHASSIS PROFONDEUR (biseaute) ---
    Rectangle {
        anchors.fill: parent; radius: 10
        color: "#08090b"; border.color: "#1a1c20"; border.width: 1
        Rectangle {
            anchors.fill: parent; anchors.margins: 2; radius: 8
            color: "transparent"; border.color: "#0f1012"; border.width: 2
        }
    }

    // --- ECLAIRAGE INCANDESCENT ---
    Rectangle {
        anchors.centerIn: parent
        width: root.rad * 2.8; height: width * 0.55; radius: width / 2
        y: root.cy - height * 0.65
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#2a1a0a" }
            GradientStop { position: 0.4; color: "#1a0f05" }
            GradientStop { position: 1.0; color: "transparent" }
        }
        opacity: 0.45 + root.needle * 0.25
        Behavior on opacity { NumberAnimation { duration: 200 } }
    }

    // --- CADRAN NOIR MAT ---
    Rectangle {
        anchors.fill: parent; anchors.margins: 6; radius: 7
        color: "#050607"; border.color: "#111215"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0a0b0d" }
            GradientStop { position: 0.55; color: "#050607" }
            GradientStop { position: 1.0; color: "#030304" }
        }
    }

    // --- BORDURE BISEAUTEE (effet profondeur) ---
    Canvas {
        anchors.fill: parent; anchors.margins: 6
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var w = width, h = height;
            // Bordure externe claire (haut/gauche)
            ctx.strokeStyle = "#1a1e24";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, h); ctx.lineTo(0, 0); ctx.lineTo(w, 0);
            ctx.stroke();
            // Bordure interne sombre (bas/droite)
            ctx.strokeStyle = "#000000";
            ctx.beginPath();
            ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h);
            ctx.stroke();
        }
    }

    // --- GRADUATIONS 100 MICRO-TICKS ---
    Canvas {
        anchors.fill: parent; anchors.margins: 6
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var cx = root.cx, cy = root.cy, r = root.rad;
            var a0 = -142 * Math.PI / 180;
            var a1 = -38 * Math.PI / 180;
            var span = 104;

            // Arc fond
            ctx.lineWidth = 2.5; ctx.strokeStyle = "#2a2f35";
            ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, false); ctx.stroke();

            // Zone rouge (derniers 18%)
            ctx.lineWidth = 4; ctx.strokeStyle = "#5a1518";
            var ar = (-142 + 0.82 * span) * Math.PI / 180;
            ctx.beginPath(); ctx.arc(cx, cy, r, ar, a1, false); ctx.stroke();

            // Zone rouge allumee
            if (root.needle > 0.82) {
                ctx.lineWidth = 3; ctx.strokeStyle = root.accent;
                ctx.globalAlpha = 0.3 + (root.needle - 0.82) * 2.5;
                ctx.beginPath(); ctx.arc(cx, cy, r, ar, a1, false); ctx.stroke();
                ctx.globalAlpha = 1.0;
            }

            // 100 micro-graduations
            for (var i = 0; i <= 100; i++) {
                var a = (-142 + i * (span / 100)) * Math.PI / 180;
                var isMajor = i % 10 === 0;
                var isMid = i % 5 === 0;
                var inner, outer, lw;
                if (isMajor) { inner = r - 16; outer = r; lw = 2.2; }
                else if (isMid) { inner = r - 10; outer = r; lw = 1.4; }
                else { inner = r - 6; outer = r; lw = 0.7; }

                var col = i >= 82 ? root.accent : (isMajor ? "#7a8590" : (isMid ? "#4a5560" : "#2a3038"));
                ctx.lineWidth = lw; ctx.strokeStyle = col;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
                ctx.stroke();
            }

            // Chiffres
            var labels = [
                {v: "-48", i: 0}, {v: "-36", i: 10}, {v: "-24", i: 20},
                {v: "-12", i: 30}, {v: "-6", i: 35}, {v: "-3", i: 40},
                {v: "0", i: 45}, {v: "+3", i: 50}
            ];
            ctx.font = "bold 8px 'DejaVu Sans Mono'"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            for (var li = 0; li < labels.length; li++) {
                var la = (-142 + labels[li].i * (span / 100)) * Math.PI / 180;
                var lx = cx + Math.cos(la) * (r - 24);
                var ly = cy + Math.sin(la) * (r - 24);
                ctx.fillStyle = "#000000"; ctx.globalAlpha = 0.6;
                ctx.fillText(labels[li].v, lx + 0.5, ly + 0.5);
                ctx.globalAlpha = 1.0;
                ctx.fillStyle = labels[li].i >= 82 ? root.accent : "#8a95a0";
                ctx.fillText(labels[li].v, lx, ly);
            }

            // Label canal
            ctx.font = "bold 10px 'DejaVu Sans Mono'";
            ctx.fillStyle = "#6a7580";
            ctx.fillText(root.label, cx, cy - r * 0.35);
        }
    }

    // --- DEMI-CERCLE FOND ---
    Canvas {
        anchors.fill: parent; anchors.margins: 6; opacity: 0.5
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var cx = root.cx, cy = root.cy, r = root.rad;
            var g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * 0.9);
            g.addColorStop(0.0, "rgba(15,12,8,0.8)");
            g.addColorStop(1.0, "rgba(5,5,6,0.2)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.88, -142 * Math.PI/180, -38 * Math.PI/180, false);
            ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
        }
    }

    // --- MARQUEUR CRETE ---
    Rectangle {
        width: 6; height: 6; radius: 3; color: "#ffcc88"; opacity: 0.85
        property real pa: (-142 + root.peak * 104) * Math.PI / 180
        x: root.cx + Math.cos(pa) * root.rad - width / 2
        y: root.cy + Math.sin(pa) * root.rad - height / 2
        Rectangle {
            anchors.centerIn: parent; width: 14; height: 14; radius: 7
            color: "transparent"; border.color: "#ffcc88"; border.width: 1; opacity: 0.4
        }
    }

    // --- OMBRE AIGUILLE ---
    Rectangle {
        id: needleShadow
        width: 1.2; height: root.rad * 0.90
        x: root.cx - width / 2 + 1.5; y: root.cy - height + 1.5
        radius: 0.6; color: "#000000"; opacity: 0.35; antialiasing: true
        transform: Rotation {
            origin.x: needleShadow.width / 2; origin.y: needleShadow.height
            angle: root.needleAngle
        }
    }

    // --- AIGUILLE (fil de métal fin, style VU réel) ---
    Rectangle {
        id: needleRect
        width: 1.2; height: root.rad * 0.92
        x: root.cx - width / 2; y: root.cy - height
        radius: 0.6; antialiasing: true
        color: "#c0a080"
        transform: Rotation {
            origin.x: needleRect.width / 2; origin.y: needleRect.height
            angle: root.needleAngle
        }
        // Reflet léger sur le bord
        Rectangle {
            anchors.left: parent.left; width: 0.5; height: parent.height
            color: "#ffffff"; opacity: 0.3; radius: parent.radius
        }
    }

    // --- MOYEU CENTRAL (sobre, petit) ---
    Rectangle {
        width: 10; height: 10; radius: 5
        x: root.cx - 5; y: root.cy - 5
        color: "#0a0b0d"; border.color: "#3a3a3a"; border.width: 1
        Rectangle {
            anchors.centerIn: parent; width: 6; height: 6; radius: 3
            color: "#050607"; border.color: root.accent; border.width: 0.8
            opacity: 0.6 + root.needle * 0.4
        }
    }

    // --- LISERE VERRE TRES SUBTIL (pas de reflets diagonaux) ---
    Rectangle {
        anchors.fill: parent; anchors.margins: 6; radius: 7
        color: "transparent"
        // Juste un leger eclat sur le bord superieur
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 1; color: Qt.rgba(1,1,1,0.03)
        }
    }

    // --- AFFICHAGE dB ---
    Text {
        anchors { right: parent.right; rightMargin: 14; top: parent.top; topMargin: 11 }
        text: Math.round(-48 + root.needle * 48) + " dB"
        color: "#ffcc88"; font.family: "DejaVu Sans Mono"
        font.pixelSize: 10; font.bold: true; opacity: 0.7
    }
}
