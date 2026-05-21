// BorderEqualizer.qml - Egaliseurs perimetriques style chaine Hi-Fi 90s.
import QtQuick 2.15

Item {
    id: root
    property string orientation: "vertical" // "vertical" ou "horizontal"
    property real value: 0.0                // 0..1
    property color colorStart: "#00ff00"
    property color colorMid: "#ffff00"
    property color colorEnd: "#ff0000"
    property int barCount: 30

    implicitWidth: orientation === "vertical" ? 20 : parent.width
    implicitHeight: orientation === "horizontal" ? 20 : parent.height

    Row {
        anchors.fill: parent
        visible: orientation === "horizontal"
        spacing: 2
        Repeater {
            model: root.barCount
            Rectangle {
                width: (parent.width / root.barCount) - 2
                height: parent.height
                property real threshold: index / root.barCount
                color: root.value > threshold ? getColor(threshold) : "#111"
                opacity: root.value > threshold ? 1.0 : 0.2
            }
        }
    }

    Column {
        anchors.fill: parent
        visible: orientation === "vertical"
        spacing: 2
        Repeater {
            model: root.barCount
            Rectangle {
                height: (parent.height / root.barCount) - 2
                width: parent.width
                property real threshold: (root.barCount - index) / root.barCount
                color: root.value > threshold ? getColor(threshold) : "#111"
                opacity: root.value > threshold ? 1.0 : 0.2
            }
        }
    }

    function getColor(t) {
        if (t < 0.5) return root.colorStart;
        if (t < 0.8) return root.colorMid;
        return root.colorEnd;
    }
}
