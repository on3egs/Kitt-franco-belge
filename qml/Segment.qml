// Segment.qml - segment individuel d'affichage 7 segments.
import QtQuick 2.15

Rectangle {
    property bool on: false
    property color accent: "#ffc24b"
    property color dim: "#1a1510"

    color: on ? accent : dim
    radius: 1.5
    opacity: on ? 1.0 : 0.35

    Behavior on color { ColorAnimation { duration: 80 } }
    Behavior on opacity { NumberAnimation { duration: 80 } }

    // Glow subtil quand allume
    Rectangle {
        anchors.fill: parent
        anchors.margins: -1
        radius: parent.radius + 1
        color: "transparent"
        border.color: parent.accent
        border.width: 1
        opacity: parent.on ? 0.25 : 0.0
        visible: parent.on
    }
}
