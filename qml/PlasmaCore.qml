// PlasmaCore.qml - Reacteur a plasma style Tokamak / Lockheed Skunk Works 1984.
//
// Anneaux concentriques tournants, lueur ambre incandescente interne,
// pulsation audio-reactive, metal brosse, verre bombe, aucun neon.
import QtQuick 2.15

Item {
    id: root

    property real energy: 0.0   // 0.0 .. 1.0 (audio bass)

    implicitWidth: 140
    implicitHeight: 140

    readonly property real cxv: width / 2
    readonly property real cyv: height / 2
    readonly property real rv: Math.min(width, height) / 2 - 10

    // === PULSATION GLOBALE ===

    // === PULSATION GLOBALE ===
    // Pulsation lente permanente (respiration du reacteur)
    property real breathe: 0.5
    NumberAnimation on breathe {
        from: 0.4; to: 0.8; duration: 2400
        loops: Animation.Infinite; running: true
        easing.type: Easing.InOutSine
    }
    // Pulsation rapide liee au bass
    readonly property real pulse: breathe + energy * 0.45

    // === CHASSIS / SUPPORT METAL ===
    Rectangle {
        anchors.fill: parent; radius: 10
        color: "#08090b"
        border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0e1014" }
            GradientStop { position: 0.5; color: "#08090b" }
            GradientStop { position: 1.0; color: "#030405" }
        }
        // Bordure chrome subtile
        Rectangle {
            anchors.fill: parent; anchors.margins: 1; radius: 9
            color: "transparent"
            border.color: Qt.rgba(1,1,1,0.03); border.width: 1
        }
    }

    // Bras de fixation superieurs
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.top: parent.top; anchors.topMargin: 4
        width: 24; height: 10; radius: 2
        color: "#121418"
        border.color: "#252830"; border.width: 1
        Rectangle {
            anchors.centerIn: parent
            width: 8; height: 2; radius: 1
            color: "#2a2d35"
        }
    }
    // Bras de fixation inferieurs
    Rectangle {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom; anchors.bottomMargin: 4
        width: 24; height: 10; radius: 2
        color: "#121418"
        border.color: "#252830"; border.width: 1
        Rectangle {
            anchors.centerIn: parent
            width: 8; height: 2; radius: 1
            color: "#2a2d35"
        }
    }

    // === CHAMBRE A VIDE (fond noir profond) ===
    Rectangle {
        anchors.centerIn: parent
        width: root.rv * 2 + 4; height: width; radius: width / 2
        color: "#020203"
        border.color: "#0d0f14"; border.width: 1
    }

    // === LUEUR INTERNE AMBRE (pulsation) ===
    Rectangle {
        anchors.centerIn: parent
        width: root.rv * 1.9; height: width; radius: width / 2
        opacity: root.pulse * 0.35
        color: "transparent"
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#ffaa33" }
            GradientStop { position: 0.3; color: "#cc5500" }
            GradientStop { position: 0.7; color: "#551a00" }
            GradientStop { position: 1.0; color: "#000000" }
        }
        Behavior on opacity {
            NumberAnimation { duration: 80; easing.type: Easing.OutQuad }
        }
    }

    // === ANNEAU EXTERIEUR (lent, bobines de champ) ===
    Rectangle {
        id: ringOuter
        anchors.centerIn: parent
        width: root.rv * 2; height: width; radius: width / 2
        color: "transparent"
        border.color: "#2a2d35"; border.width: 2.5
        Rectangle {
            anchors.centerIn: parent; width: 4; height: 4; radius: 2; color: "#3a3e45"
        }
        // Bobines de champ magnetique (8 segments)
        Repeater {
            model: 8
            Rectangle {
                width: 5; height: 10; radius: 1
                color: "#1e2128"
                border.color: "#2a2d35"; border.width: 0.5
                x: ringOuter.width / 2 + Math.cos(index * Math.PI / 4) * (ringOuter.width / 2 - 6) - width / 2
                y: ringOuter.height / 2 + Math.sin(index * Math.PI / 4) * (ringOuter.height / 2 - 6) - height / 2
                transform: Rotation {
                    origin.x: width / 2; origin.y: height / 2
                    angle: index * 45
                }
            }
        }
        transform: Rotation {
            origin.x: ringOuter.width / 2; origin.y: ringOuter.height / 2
            angle: 0
            NumberAnimation on angle {
                from: 0; to: 360; duration: 28000; loops: Animation.Infinite
            }
        }
    }

    // === ANNEAU MEDIAN (moyen, inverse) ===
    Rectangle {
        id: ringMid
        anchors.centerIn: parent
        width: root.rv * 1.5; height: width; radius: width / 2
        color: "transparent"
        border.color: "#3a3225"; border.width: 1.5
        // 4 grilles internes
        Repeater {
            model: 4
            Rectangle {
                width: 2; height: 8; radius: 1
                color: "#2a2520"
                x: ringMid.width / 2 + Math.cos(index * Math.PI / 2 + Math.PI/4) * (ringMid.width / 2 - 4) - width / 2
                y: ringMid.height / 2 + Math.sin(index * Math.PI / 2 + Math.PI/4) * (ringMid.height / 2 - 4) - height / 2
                transform: Rotation {
                    origin.x: width / 2; origin.y: height / 2
                    angle: index * 90 + 45
                }
            }
        }
        transform: Rotation {
            origin.x: ringMid.width / 2; origin.y: ringMid.height / 2
            angle: 0
            NumberAnimation on angle {
                from: 360; to: 0; duration: 18000; loops: Animation.Infinite
            }
        }
    }

    // === ANNEAU INTERNE (rapide, sections de cuivre) ===
    Rectangle {
        id: ringInner
        anchors.centerIn: parent
        width: root.rv * 0.9; height: width; radius: width / 2
        color: "transparent"
        border.color: "#4a3a20"; border.width: 1
        // 6 sections de cuivre
        Repeater {
            model: 6
            Rectangle {
                width: 3; height: 5; radius: 1
                color: "#5a4020"
                x: ringInner.width / 2 + Math.cos(index * Math.PI / 3) * (ringInner.width / 2 - 3) - width / 2
                y: ringInner.height / 2 + Math.sin(index * Math.PI / 3) * (ringInner.height / 2 - 3) - height / 2
                transform: Rotation {
                    origin.x: width / 2; origin.y: height / 2
                    angle: index * 60
                }
            }
        }
        transform: Rotation {
            origin.x: ringInner.width / 2; origin.y: ringInner.height / 2
            angle: 0
            NumberAnimation on angle {
                from: 0; to: 360; duration: 6000; loops: Animation.Infinite
            }
        }
    }

    // === CENTRE - FILAMENT ===
    Rectangle {
        id: filament
        anchors.centerIn: parent
        width: 12; height: 12; radius: 6
        color: "#ffcc77"
        opacity: 0.3 + root.pulse * 0.7
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#ffffff" }
            GradientStop { position: 0.4; color: "#ffaa44" }
            GradientStop { position: 1.0; color: "#883300" }
        }
        border.color: "#ff8844"; border.width: 0.5
        Behavior on opacity {
            NumberAnimation { duration: 60; easing.type: Easing.OutQuad }
        }
        // Halo tres subtil autour du filament
        Rectangle {
            anchors.centerIn: parent
            width: 20; height: 20; radius: 10
            color: "#ff8800"
            opacity: (root.pulse - 0.3) * 0.15
            z: -1
        }
    }

    // === GRIFFES DE FIXATION CENTRALES ===
    Repeater {
        model: 4
        Rectangle {
            width: 3; height: 6; radius: 1
            color: "#1a1c22"
            x: root.cxv + Math.cos(index * Math.PI / 2) * 8 - width / 2
            y: root.cyv + Math.sin(index * Math.PI / 2) * 8 - height / 2
            transform: Rotation {
                origin.x: width / 2; origin.y: height / 2
                angle: index * 90
            }
        }
    }

    // === VERRE BOMBE (reflet subtil) ===
    Rectangle {
        anchors.fill: parent; anchors.margins: 4; radius: 8
        color: "transparent"
        gradient: Gradient {
            GradientStop { position: 0.0; color: Qt.rgba(1,1,1,0.02) }
            GradientStop { position: 0.12; color: Qt.rgba(1,1,1,0.005) }
            GradientStop { position: 0.4; color: "transparent" }
            GradientStop { position: 1.0; color: "transparent" }
        }
    }

    // === VIGNETTAGE PERIPHERIQUE ===
    Rectangle {
        anchors.fill: parent; radius: 10
        color: "transparent"
        border.color: "#000000"; border.width: 6; opacity: 0.25
    }

    // === ETIQUETTE TOKAMAK ===
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom; anchors.bottomMargin: 14
        text: "TOKAMAK-α"
        color: "#3a3225"
        font.family: "DejaVu Sans Mono"; font.pixelSize: 6; font.bold: true
        opacity: 0.7
    }

}
