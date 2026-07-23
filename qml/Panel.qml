// Panel.qml - cadre de section avec profondeur materielle.
//
// Effet verre translucide, ambient occlusion, micro-reliefs,
// patine subtile, reflets de surface.
import QtQuick 2.15

Rectangle {
    id: panel

    property string title: ""
    property color accent: "#ff5b69"
    default property alias body: bodyArea.data

    implicitWidth: 220
    implicitHeight: 130

    color: "#0e0f14"
    radius: 8
    border.color: Qt.rgba(panel.accent.r, panel.accent.g, panel.accent.b, 0.18)
    border.width: 1

    gradient: Gradient {
        GradientStop { position: 0.0; color: "#13151c" }
        GradientStop { position: 0.45; color: "#0e0f14" }
        GradientStop { position: 1.0; color: "#08090c" }
    }

    // Reflet superieur vitre
    Rectangle {
        anchors { left: parent.left; right: parent.right; top: parent.top }
        height: parent.radius
        radius: parent.radius
        color: "transparent"
        border.color: Qt.rgba(1, 1, 1, 0.035)
        border.width: 1
    }

    // Ombre interne (ambient occlusion)
    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: "transparent"
        border.color: "#000000"
        border.width: 2
        opacity: 0.2
    }

    // Halo accent tres discret
    Rectangle {
        anchors.fill: parent
        radius: parent.radius
        color: "transparent"
        border.color: Qt.rgba(panel.accent.r, panel.accent.g, panel.accent.b, 0.04)
        border.width: 3
    }

    // Biseaute interieur
    Rectangle {
        anchors.fill: parent
        anchors.margins: 1
        radius: parent.radius - 1
        color: "transparent"
        border.color: Qt.rgba(1, 1, 1, 0.02)
        border.width: 1
    }

    Item {
        id: header
        visible: panel.title.length > 0
        height: visible ? 28 : 0
        anchors { left: parent.left; right: parent.right; top: parent.top }

        Text {
            anchors {
                left: parent.left; leftMargin: 12
                verticalCenter: parent.verticalCenter
            }
            text: panel.title
            color: panel.accent
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 10
            font.bold: true
            opacity: 0.85
        }
        Rectangle {
            anchors {
                left: parent.left; right: parent.right; bottom: parent.bottom
                leftMargin: 10; rightMargin: 10
            }
            height: 1
            color: Qt.rgba(panel.accent.r, panel.accent.g, panel.accent.b, 0.12)
        }
    }

    Item {
        id: bodyArea
        anchors {
            left: parent.left; right: parent.right
            top: header.bottom; bottom: parent.bottom
            leftMargin: 10; rightMargin: 10
            topMargin: panel.title.length > 0 ? 5 : 10
            bottomMargin: 10
        }
        clip: true
    }
}
