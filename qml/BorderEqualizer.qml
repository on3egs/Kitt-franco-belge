// BorderEqualizer.qml - Egaliseurs perimetriques style ampoules incandescentes.
//
// Chaque LED est un petit dome rond avec glow diffus, pas des rectangles plats.
// Effet de persistance lente pour un rendu organique analogique.
import QtQuick 2.15

Item {
    id: root
    property string orientation: "vertical"
    property real value: 0.0
    property color colorStart: "#00ff00"
    property color colorMid: "#ffff00"
    property color colorEnd: "#ff0000"
    property int barCount: 30

    implicitWidth: orientation === "vertical" ? 18 : parent.width
    implicitHeight: orientation === "horizontal" ? 18 : parent.height

    // Persistance analogique (chute lente)
    property real displayValue: 0.0
    onValueChanged: if (value > displayValue) displayValue = value
    Behavior on displayValue {
        NumberAnimation { duration: 200; easing.type: Easing.OutCubic }
    }
    Timer {
        interval: 70; running: true; repeat: true
        onTriggered: if (root.displayValue > root.value) root.displayValue = root.value
    }

    Row {
        anchors.fill: parent
        anchors.margins: orientation === "horizontal" ? 0 : 2
        visible: orientation === "horizontal"
        spacing: 2
        Repeater {
            model: root.barCount
            Item {
                width: Math.max(2, (parent.width - (root.barCount - 1) * 2) / root.barCount)
                height: parent.height - 2
                anchors.verticalCenter: parent.verticalCenter
                property real threshold: index / root.barCount
                property bool isOn: root.displayValue > threshold
                property color ledColor: getColor(threshold)

                // Dome LED (ampoule incandescente)
                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width; height: Math.min(parent.width, parent.height)
                    radius: width / 2
                    color: parent.isOn ? parent.ledColor : "#0c0d10"
                    opacity: parent.isOn ? 1.0 : 0.2
                    Behavior on opacity { NumberAnimation { duration: 60 } }
                    Behavior on color { ColorAnimation { duration: 80 } }

                    // Reflet de dome
                    Rectangle {
                        anchors.top: parent.top; anchors.left: parent.left
                        anchors.topMargin: 1; anchors.leftMargin: 1
                        width: parent.width * 0.35; height: width
                        radius: width / 2
                        color: Qt.rgba(1, 1, 1, 0.25)
                        visible: parent.parent.isOn
                    }
                }

                // Glow diffus (halo d'ampoule)
                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width + 4; height: width
                    radius: width / 2
                    color: "transparent"
                    border.color: parent.ledColor
                    border.width: 1
                    opacity: parent.isOn ? 0.3 : 0.0
                    Behavior on opacity { NumberAnimation { duration: 100 } }
                }
            }
        }
    }

    Column {
        anchors.fill: parent
        anchors.margins: orientation === "vertical" ? 2 : 0
        visible: orientation === "vertical"
        spacing: 2
        Repeater {
            model: root.barCount
            Item {
                height: Math.max(2, (parent.height - (root.barCount - 1) * 2) / root.barCount)
                width: parent.width - 2
                anchors.horizontalCenter: parent.horizontalCenter
                property real threshold: (root.barCount - index) / root.barCount
                property bool isOn: root.displayValue > threshold
                property color ledColor: getColor(threshold)

                Rectangle {
                    anchors.centerIn: parent
                    width: Math.min(parent.width, parent.height); height: parent.height
                    radius: height / 2
                    color: parent.isOn ? parent.ledColor : "#0c0d10"
                    opacity: parent.isOn ? 1.0 : 0.2
                    Behavior on opacity { NumberAnimation { duration: 60 } }
                    Behavior on color { ColorAnimation { duration: 80 } }

                    Rectangle {
                        anchors.top: parent.top; anchors.left: parent.left
                        anchors.topMargin: 1; anchors.leftMargin: 1
                        width: parent.width * 0.35; height: width
                        radius: width / 2
                        color: Qt.rgba(1, 1, 1, 0.25)
                        visible: parent.parent.isOn
                    }
                }

                Rectangle {
                    anchors.centerIn: parent
                    width: parent.width + 4; height: parent.height + 4
                    radius: height / 2
                    color: "transparent"
                    border.color: parent.ledColor
                    border.width: 1
                    opacity: parent.isOn ? 0.3 : 0.0
                    Behavior on opacity { NumberAnimation { duration: 100 } }
                }
            }
        }
    }

    function getColor(t) {
        if (t < 0.5) return root.colorStart;
        if (t < 0.8) return root.colorMid;
        return root.colorEnd;
    }
}
