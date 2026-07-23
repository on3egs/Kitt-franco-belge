// ToneKnob.qml - bouton rotatif aluminium brosse style ampli hi-fi annees 80.
import QtQuick 2.15

Item {
    id: root
    property real value: 0.5
    property color accent: "#cc3040"
    property string label: "BASS"
    signal knobMoved(real newValue)

    implicitWidth: 46
    implicitHeight: 58

    // Ombre portee
    Rectangle {
        anchors.centerIn: parent
        anchors.verticalCenterOffset: 3
        width: 32; height: 32; radius: 16
        color: "#000000"; opacity: 0.4
    }

    // Base fixe avec marquages
    Rectangle {
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -2
        width: 34; height: 34; radius: 17
        color: "#0a0b0d"
        border.color: "#1a1c22"; border.width: 1
        Canvas {
            anchors.fill: parent
            onPaint: {
                var ctx = getContext("2d"); ctx.reset();
                var cx = width / 2, cy = height / 2, r = width / 2 - 2;
                ctx.font = "4px 'DejaVu Sans Mono'";
                ctx.textAlign = "center"; ctx.textBaseline = "middle";
                ctx.fillStyle = "#1a2028";
                ctx.fillText("L", cx - r + 5, cy);
                ctx.fillText("H", cx + r - 5, cy);
                ctx.strokeStyle = "#1a2028"; ctx.lineWidth = 0.5;
                for (var i = 0; i <= 10; i++) {
                    var a = (-135 + i * 270 / 10) * Math.PI / 180;
                    var inner = r - 2;
                    ctx.beginPath();
                    ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
                    ctx.lineTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
                    ctx.stroke();
                }
            }
        }
    }

    // Bouton rotatif aluminium brosse
    Rectangle {
        id: knob
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -2
        width: 30; height: 30; radius: 15
        // Aluminium brosse degrade
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#4a4e55" }
            GradientStop { position: 0.2; color: "#3a3e45" }
            GradientStop { position: 0.5; color: "#2a2e35" }
            GradientStop { position: 0.8; color: "#1a1c22" }
            GradientStop { position: 1.0; color: "#0c0d10" }
        }
        border.color: "#5a5e65"; border.width: 0.5

        // Reflet metal haut
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: parent.radius; radius: parent.radius
            color: "transparent"
            border.color: Qt.rgba(1,1,1,0.15); border.width: 1
        }
        // Ombre bas
        Rectangle {
            anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
            height: parent.radius; radius: parent.radius
            color: "transparent"
            border.color: Qt.rgba(0,0,0,0.3); border.width: 1
        }
        // Ligne indicateur
        Rectangle {
            anchors.top: parent.top; anchors.topMargin: 2
            anchors.horizontalCenter: parent.horizontalCenter
            width: 2; height: 8; radius: 1
            color: root.accent; opacity: 0.95
        }
        // Point lumineux
        Rectangle {
            anchors.top: parent.top; anchors.topMargin: 2
            anchors.horizontalCenter: parent.horizontalCenter
            width: 3; height: 3; radius: 1.5
            color: root.accent; opacity: 0.7
        }
        // Rainures sur le cote (effet grip aluminium)
        Repeater {
            model: 12
            Rectangle {
                width: 0.5; height: 4; radius: 0.25
                color: "#1a1c20"
                anchors.centerIn: parent
                transform: Rotation {
                    origin.x: width / 2; origin.y: height / 2
                    angle: index * 30
                }
                y: -parent.height * 0.32
            }
        }
        transform: Rotation {
            origin.x: knob.width / 2; origin.y: knob.height / 2
            angle: -135 + root.value * 270
            Behavior on angle { NumberAnimation { duration: 150; easing.type: Easing.OutCubic } }
        }
    }

    // Glow tres subtil (annee 80, pas neon)
    Rectangle {
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -2
        width: parent.width + 2; height: width; radius: width / 2
        color: "transparent"
        border.color: root.accent; border.width: 0.5
        opacity: 0.03 + root.value * 0.05
    }

    // Label
    Text {
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 1 }
        text: root.label; color: root.accent
        font.family: "DejaVu Sans Mono"; font.pixelSize: 6; font.bold: true
        opacity: 0.80
    }

    // Barre de valeur
    Rectangle {
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 9 }
        width: 24; height: 2.5; radius: 1
        color: "#08090c"; border.color: "#121418"; border.width: 0.5
        Rectangle {
            anchors.left: parent.left; anchors.leftMargin: 1
            anchors.verticalCenter: parent.verticalCenter
            width: (parent.width - 2) * root.value; height: parent.height - 2; radius: 1
            color: root.accent; opacity: 0.6
        }
    }

    // Interaction
    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        property real startX: 0
        property real startVal: 0
        onPressed: { startX = mouse.x; startVal = root.value; }
        onPositionChanged: {
            if (pressed) {
                var delta = (mouse.x - startX) / 50;
                root.value = Math.max(0, Math.min(1, startVal + delta));
                root.knobMoved(root.value);
            }
        }
    }
}
