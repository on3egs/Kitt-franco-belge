// ToneControls.qml - 6 boutons de reglage style amplificateur hi-fi annees 80.
//
// Potards coniques aluminium brosse : BASS, MID, TREBLE, BALANCE, DOLBY, INPUT.
// Relief 3D, ombres douces, reflets metal, indicateurs lumineux colores.
import QtQuick 2.15

Item {
    id: root
    implicitWidth: 160
    implicitHeight: 130

    property real bassValue: 0.5
    property real midValue: 0.5
    property real trebleValue: 0.5
    property real balanceValue: 0.5
    property real dolbyValue: 0.5
    property real inputValue: 0.5

    // --- BOITIER METAL ---
    Rectangle {
        anchors.fill: parent; radius: 8
        color: "#08090c"; border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0f1116" }
            GradientStop { position: 0.5; color: "#08090c" }
            GradientStop { position: 1.0; color: "#040508" }
        }
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 1; color: "#8a8f96"; opacity: 0.12
        }
    }

    // --- TITRE ---
    Text {
        anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 4 }
        text: "TONE"; color: "#4a5060"
        font.family: "DejaVu Sans Mono"; font.pixelSize: 5; font.bold: true; opacity: 0.5
    }

    // --- 2 RANGEES DE 3 POTARDS ---
    Column {
        anchors {
            horizontalCenter: parent.horizontalCenter
            top: parent.top; topMargin: 12
            bottom: parent.bottom; bottomMargin: 3
        }
        spacing: 2

        // Rangee 1
        Row {
            spacing: 4; anchors.horizontalCenter: parent.horizontalCenter
            ToneKnob {
                value: root.bassValue; accent: "#cc3040"; label: "BASS"
                onKnobMoved: root.bassValue = newValue
            }
            ToneKnob {
                value: root.midValue; accent: "#cc8820"; label: "MID"
                onKnobMoved: root.midValue = newValue
            }
            ToneKnob {
                value: root.trebleValue; accent: "#20aacc"; label: "TREBLE"
                onKnobMoved: root.trebleValue = newValue
            }
        }

        // Rangee 2
        Row {
            spacing: 4; anchors.horizontalCenter: parent.horizontalCenter
            ToneKnob {
                value: root.balanceValue; accent: "#8888cc"; label: "BAL"
                onKnobMoved: root.balanceValue = newValue
            }
            ToneKnob {
                value: root.dolbyValue; accent: "#88cc44"; label: "DOLBY"
                onKnobMoved: root.dolbyValue = newValue
            }
            ToneKnob {
                value: root.inputValue; accent: "#cc66aa"; label: "INPUT"
                onKnobMoved: root.inputValue = newValue
            }
        }
    }
}
