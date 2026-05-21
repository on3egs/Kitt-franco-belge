// SocialRow.qml - une ligne reseau social du splash : icone dessinee +
// identifiant, halo pulsant. Cliquable : ouvre le compte dans le navigateur.
// Le fade-in d'apparition est pilote par le parent (splash).
import QtQuick 2.15

Item {
    id: root

    property string handle: ""
    property color glow: "#ff2a3a"
    property string link: ""
    default property alias iconData: iconHolder.data

    implicitWidth: 234
    implicitHeight: 36
    opacity: 0   // revele en fondu par le parent

    Row {
        anchors.centerIn: parent
        spacing: 14

        // Porte-icone 30x30 avec halo pulsant (le "glow")
        Item {
            width: 30; height: 30
            anchors.verticalCenter: parent.verticalCenter
            scale: rowMouse.containsMouse ? 1.12 : 1.0
            Behavior on scale {
                NumberAnimation { duration: 140; easing.type: Easing.OutCubic }
            }

            Rectangle {
                anchors.centerIn: parent
                width: 40; height: 40; radius: 13
                color: root.glow
                opacity: 0.0
                SequentialAnimation on opacity {
                    running: root.opacity > 0.5
                    loops: Animation.Infinite
                    NumberAnimation {
                        from: 0.05; to: 0.26
                        duration: 1150; easing.type: Easing.InOutSine
                    }
                    NumberAnimation {
                        from: 0.26; to: 0.05
                        duration: 1150; easing.type: Easing.InOutSine
                    }
                }
            }

            Item { id: iconHolder; anchors.fill: parent }
        }

        // Identifiant
        Text {
            anchors.verticalCenter: parent.verticalCenter
            width: 170
            text: root.handle
            color: rowMouse.containsMouse ? "#ffffff" : "#dfe4ea"
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 13; font.bold: true
            font.underline: rowMouse.containsMouse
            style: Text.Raised
            styleColor: Qt.rgba(root.glow.r, root.glow.g, root.glow.b, 0.30)
        }
    }

    // Zone cliquable : ouvre le compte dans le navigateur
    MouseArea {
        id: rowMouse
        anchors.fill: parent
        hoverEnabled: true
        enabled: root.link !== "" && root.opacity > 0.5
        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
        onClicked: if (root.link !== "") Qt.openUrlExternally(root.link)
    }
}
