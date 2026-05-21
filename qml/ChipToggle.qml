// ChipToggle.qml - petit interrupteur a puce (mode video/mp3, playlist, lite...).
import QtQuick 2.15

Item {
    id: root

    property string label: ""
    property bool active: false
    property color accent: "#35e6ff"
    signal toggled()

    implicitWidth: row.implicitWidth + 24
    implicitHeight: 30

    Rectangle {
        anchors.fill: parent
        radius: 5
        color: root.active ? Qt.darker(root.accent, 4.2) : "#0a0c10"
        border.width: 1
        border.color: root.active ? root.accent : "#33373e"
        Behavior on border.color { ColorAnimation { duration: 150 } }
        Behavior on color { ColorAnimation { duration: 150 } }
    }

    Row {
        id: row
        anchors.centerIn: parent
        spacing: 8

        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: 9; height: 9; radius: 4.5
            color: root.active ? root.accent : "#3a3f47"
            Behavior on color { ColorAnimation { duration: 150 } }
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: root.label
            color: root.active ? "#ffffff" : "#8b929a"
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 10
            font.bold: true
        }
    }

    MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: root.toggled()
    }
}
