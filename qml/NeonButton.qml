// NeonButton.qml - bouton neon sobre, style tableau de bord KARR.
import QtQuick 2.15
import Kyronext 1.0

Item {
    id: root

    property string label: "BUTTON"
    property color accent: "#ff3348"
    signal clicked()

    implicitWidth: 150
    implicitHeight: 44
    opacity: enabled ? 1.0 : 0.38
    Behavior on opacity { NumberAnimation { duration: 150 } }

    // Halo discret au survol.
    Rectangle {
        anchors.fill: parent
        anchors.margins: -3
        radius: 9
        color: "transparent"
        border.color: root.accent
        border.width: 2
        opacity: mouse.containsMouse && root.enabled ? 0.40 : 0.0
        Behavior on opacity { NumberAnimation { duration: 150 } }
    }

    Rectangle {
        id: body
        anchors.fill: parent
        radius: 5
        gradient: Gradient {
            GradientStop {
                position: 0.0
                color: Qt.darker(root.accent, mouse.pressed ? 1.2 : 3.0)
            }
            GradientStop {
                position: 1.0
                color: Qt.darker(root.accent, mouse.pressed ? 1.8 : 5.5)
            }
        }
        border.width: 1.5
        border.color: mouse.containsMouse && root.enabled
                      ? root.accent : Qt.darker(root.accent, 2.0)
        scale: mouse.pressed && root.enabled ? 0.965 : 1.0
        Behavior on scale { NumberAnimation { duration: 80 } }
        Behavior on border.color { ColorAnimation { duration: 150 } }

        // Lisere clair en haut, touche "verre".
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            anchors.margins: 4
            height: 1
            color: Qt.lighter(root.accent, 1.4)
            opacity: 0.45
        }

        Text {
            anchors.centerIn: parent
            text: root.label
            color: root.enabled ? "#ffffff" : "#8a8f96"
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 12
            font.bold: true
        }
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        onClicked: { SoundFx.click(); root.clicked(); }
    }
}
