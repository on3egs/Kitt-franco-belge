// Gauge.qml - compteur circulaire style Smiths / VDO annees 80.
//
// Fond noir mat profond, graduations encre grise, aiguille fine rouge,
// chiffres blanc casse vintage, moyeu metal, verre bombe, aucun neon.
import QtQuick 2.15

Item {
    id: root

    property real value: 0.0
    property real maxValue: 100.0
    property bool autoScale: false
    property string label: "GAUGE"
    property string unit: "%"
    property int decimals: 0
    property color accent: "#ff5b69"

    implicitWidth: 152
    implicitHeight: 152

    property real observedMax: 1.0
    readonly property real scaleMax: autoScale ? Math.max(observedMax, 0.5) : maxValue
    onValueChanged: {
        if (autoScale && value * 1.2 > observedMax)
            observedMax = value * 1.2;
        frac = Math.max(0, Math.min(1, value / scaleMax));
    }
    onScaleMaxChanged: frac = Math.max(0, Math.min(1, value / scaleMax))

    property real frac: 0.0
    Behavior on frac {
        SpringAnimation { spring: 3.0; damping: 0.34; mass: 0.6; epsilon: 0.002 }
    }

    readonly property real arcStart: 130
    readonly property real arcSpan: 280

    // --- Centre et rayon unifies pour tous les elements circulaires ---
    readonly property real cxv: width / 2
    readonly property real cyv: height / 2
    readonly property real rv: Math.min(width, height) / 2 - 14

    // === CHASSIS METAL ===
    Rectangle {
        anchors.fill: parent; radius: 12
        color: "#090a0c"
        border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#101216" }
            GradientStop { position: 0.5; color: "#090a0c" }
            GradientStop { position: 1.0; color: "#040508" }
        }
        // Bordure chrome subtile
        Rectangle {
            anchors.fill: parent; anchors.margins: 1; radius: 11
            color: "transparent"
            border.color: Qt.rgba(1,1,1,0.04); border.width: 1
        }
    }

    // === CADRAN NOIR MAT (concentrique parfait avec les graduations) ===
    Rectangle {
        anchors.centerIn: parent
        width: root.rv * 2 + 12; height: width; radius: width / 2
        color: "#050607"
        border.color: "#0c0e12"; border.width: 1
        // AO interne
        Rectangle {
            anchors.fill: parent; radius: parent.radius
            color: "transparent"
            border.color: "#000000"; border.width: 3; opacity: 0.3
        }
    }

    // === GRADUATIONS ET CHIFFRES (Canvas) ===
    // Le Canvas remplit le parent SANS marges pour que width/2 et height/2
    // correspondent exactement au centre du gauge.
    Canvas {
        id: tickCanvas
        anchors.fill: parent
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var cx = width / 2, cy = height / 2, r = root.rv + 6;
            var start = root.arcStart, span = root.arcSpan;

            // Piste fond gris mat
            ctx.lineWidth = 3; ctx.strokeStyle = "#1a1c22";
            ctx.beginPath();
            ctx.arc(cx, cy, r, start * Math.PI/180, (start + span) * Math.PI/180, false);
            ctx.stroke();

            // 40 micro-graduations
            for (var i = 0; i <= 40; i++) {
                var angle = (start + i * (span / 40)) * Math.PI / 180;
                var isMajor = i % 10 === 0;
                var isMid = i % 5 === 0;
                var len = isMajor ? 8 : (isMid ? 5 : 2.5);
                var lw = isMajor ? 1.5 : (isMid ? 0.9 : 0.4);
                var col = isMajor ? "#5a6068" : (isMid ? "#3a3e45" : "#1a1c22");

                ctx.lineWidth = lw; ctx.strokeStyle = col;
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
                ctx.lineTo(cx + Math.cos(angle) * (r - len), cy + Math.sin(angle) * (r - len));
                ctx.stroke();
            }

            // Chiffres majeurs (0, 25, 50, 75, 100)
            var nums = [0, 25, 50, 75, 100];
            ctx.font = "bold 8px 'DejaVu Sans Mono'";
            ctx.textAlign = "center"; ctx.textBaseline = "middle";
            for (var ni = 0; ni < nums.length; ni++) {
                var i2 = ni * 10;
                var angle2 = (start + i2 * (span / 40)) * Math.PI / 180;
                var tx = cx + Math.cos(angle2) * (r - 16);
                var ty = cy + Math.sin(angle2) * (r - 16);
                // Ombre leger
                ctx.fillStyle = "#000000"; ctx.globalAlpha = 0.5;
                ctx.fillText(nums[ni].toString(), tx + 0.5, ty + 0.5);
                ctx.globalAlpha = 1.0;
                // Texte blanc casse
                ctx.fillStyle = "#a0a6ae";
                ctx.fillText(nums[ni].toString(), tx, ty);
            }

            // Petit traits rouges sur les 3 derniers segments
            for (var ri = 31; ri <= 40; ri++) {
                var ra = (start + ri * (span / 40)) * Math.PI / 180;
                ctx.lineWidth = 1; ctx.strokeStyle = "#802020";
                ctx.beginPath();
                ctx.moveTo(cx + Math.cos(ra) * r, cy + Math.sin(ra) * r);
                ctx.lineTo(cx + Math.cos(ra) * (r - 6), cy + Math.sin(ra) * (r - 6));
                ctx.stroke();
            }

            // Label canal en arc
            ctx.font = "bold 7px 'DejaVu Sans Mono'";
            ctx.fillStyle = "#4a5060";
            ctx.textAlign = "center";
            ctx.fillText(root.label, cx, cy - r * 0.3);
        }
    }

    // === ARC DE VALEUR (rouge mat) ===
    Canvas {
        id: arcCanvas
        anchors.fill: parent
        Timer {
            interval: 16; running: true; repeat: true
            onTriggered: arcCanvas.requestPaint()
        }
        onPaint: {
            var ctx = getContext("2d"); ctx.reset();
            var cx = width / 2, cy = height / 2, r = root.rv + 6;
            var start = root.arcStart;

            ctx.lineWidth = 3; ctx.strokeStyle = "#cc2020";
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(cx, cy, r, start * Math.PI/180, (start + root.frac * root.arcSpan) * Math.PI/180, false);
            ctx.stroke();

            // Glow tres subtil
            ctx.lineWidth = 6; ctx.strokeStyle = "#cc2020";
            ctx.globalAlpha = 0.08;
            ctx.beginPath();
            ctx.arc(cx, cy, r, start * Math.PI/180, (start + root.frac * root.arcSpan) * Math.PI/180, false);
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }

    // === AIGUILLE (style Smiths fine rouge) ===
    // Ombre (decalee de 0.5 px pour rester subtile mais plus precise)
    Rectangle {
        id: needleShadow
        width: 2; height: root.rv * 0.7
        x: root.cxv - width / 2 + 0.5; y: root.cyv - height + 0.5
        radius: 1; color: "#000000"; opacity: 0.35; antialiasing: true
        transform: Rotation {
            origin.x: needleShadow.width / 2; origin.y: needleShadow.height
            angle: root.arcStart + root.frac * root.arcSpan
        }
    }
    // Aiguille rouge
    Rectangle {
        id: needle
        width: 1.5; height: root.rv * 0.72
        x: root.cxv - width / 2; y: root.cyv - height
        radius: 0.75; color: "#cc2020"; antialiasing: true
        transform: Rotation {
            origin.x: needle.width / 2; origin.y: needle.height
            angle: root.arcStart + root.frac * root.arcSpan
        }
    }
    // Point lumineux (balancier) a la pointe
    Rectangle {
        width: 2.5; height: 2.5; radius: 1.25
        x: root.cxv + Math.cos((root.arcStart + root.frac * root.arcSpan) * Math.PI/180) * root.rv * 0.72 - width / 2
        y: root.cyv + Math.sin((root.arcStart + root.frac * root.arcSpan) * Math.PI/180) * root.rv * 0.72 - height / 2
        color: "#ff5555"; opacity: 0.7
    }

    // === MOYEU CENTRAL METAL ===
    Rectangle {
        anchors.centerIn: parent
        width: 12; height: 12; radius: 6
        color: "#0a0b0d"; border.color: "#3a3e45"; border.width: 1
        Rectangle {
            anchors.centerIn: parent
            width: 6; height: 6; radius: 3
            color: "#060708"; border.color: "#cc2020"; border.width: 0.6
            opacity: 0.5 + root.frac * 0.5
        }
        // Vis centrale
        Rectangle {
            anchors.centerIn: parent
            width: 2; height: 2; radius: 1
            color: "#1a1c22"
        }
    }

    // === VALEUR NUMERIQUE CENTRE ===
    Column {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.verticalCenter: parent.verticalCenter
        anchors.verticalCenterOffset: 10
        spacing: 0
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.value.toFixed(root.decimals)
            color: "#a0a6ae"
            font.family: "DejaVu Sans Mono"; font.pixelSize: 18; font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.unit
            color: "#3a3e45"
            font.family: "DejaVu Sans Mono"; font.pixelSize: 7; font.bold: true
        }
    }

    // === VERRE BOMBE (reflet subtil) ===
    Rectangle {
        anchors.fill: parent; anchors.margins: 6; radius: 10
        color: "transparent"
        // Reflet courbe haut-gauche
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(1,1,1,0.03) }
            GradientStop { position: 0.15; color: Qt.rgba(1,1,1,0.01) }
            GradientStop { position: 0.35; color: "transparent" }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }
}
