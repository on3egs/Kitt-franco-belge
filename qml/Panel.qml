// Panel.qml - cadre de section a hauteur automatique.
//
// La hauteur s'ajuste seule au contenu : les sections empilees dans la fenetre
// n'ont donc jamais besoin de hauteur codee en dur.
import QtQuick 2.15

Rectangle {
    id: panel

    property string title: ""
    property color accent: "#ff5b69"
    // Le contenu ecrit entre les accolades de <Panel> arrive dans bodyArea.
    default property alias body: bodyArea.data

    implicitHeight: header.height
                    + (title.length > 0 ? 10 : 14)
                    + bodyArea.childrenRect.height
                    + 14

    color: "#0c0e12"
    radius: 7
    border.color: "#37121a"
    border.width: 1

    Item {
        id: header
        visible: panel.title.length > 0
        height: visible ? 36 : 0
        anchors { left: parent.left; right: parent.right; top: parent.top }

        Text {
            anchors {
                left: parent.left; leftMargin: 16
                verticalCenter: parent.verticalCenter
            }
            text: panel.title
            color: panel.accent
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 11
            font.bold: true
        }
        Rectangle {
            anchors {
                left: parent.left; right: parent.right; bottom: parent.bottom
                leftMargin: 14; rightMargin: 14
            }
            height: 1
            color: "#2a0c12"
        }
    }

    Item {
        id: bodyArea
        anchors {
            left: parent.left; right: parent.right; top: header.bottom
            leftMargin: 16; rightMargin: 16
            topMargin: panel.title.length > 0 ? 10 : 14
        }
        height: childrenRect.height
    }
}
