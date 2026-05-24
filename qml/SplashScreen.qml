// SplashScreen.qml - ecran de demarrage : effigie, titre, auteur et barre
// de chargement. S'affiche quelques secondes puis s'efface en fondu.
import QtQuick 2.15
import Kyronext 1.0

Item {
    id: root
    z: 500
    visible: true

    // Emis quand le splash se termine (fin de sequence ou clic pour passer).
    signal finished()

    readonly property color cAccent: "#ff2a3a"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    // Sons de demarrage (console power-up + scanner KITT)
    Component.onCompleted: SoundFx.splash()

    // --- Fond opaque ---
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0b0c10" }
            GradientStop { position: 0.55; color: "#040506" }
            GradientStop { position: 1.0; color: "#000000" }
        }
    }

    // Clic = passer le demarrage - CORRIGE : desactive quand invisible
    MouseArea {
        anchors.fill: parent
        enabled: root.visible && root.opacity > 0.1
        onClicked: {
            seq.stop(); socialSeq.stop();
            SoundFx.stopSplash();
            root.visible = false;
            root.finished();
        }
    }

    // --- Bloc central ---
    Column {
        anchors.centerIn: parent
        spacing: 16

        // Halo + effigie
        Item {
            anchors.horizontalCenter: parent.horizontalCenter
            width: 340; height: 220

            Rectangle {
                anchors.centerIn: parent
                width: 300; height: 160; radius: 80
                color: root.cAccent
                opacity: 0.07
            }
            Image {
                anchors.centerIn: parent
                source: "../assets/kitt.png"
                fillMode: Image.PreserveAspectFit
                width: 330
                smooth: true
            }
        }

        // Titre
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "KYRONEXT STUDIO"
            color: root.cAccent
            font.family: root.mono; font.pixelSize: 34; font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "KNIGHT INDUSTRIES MEDIA CENTER"
            color: root.cTextDim
            font.family: root.mono; font.pixelSize: 10; font.bold: true
        }

        Item { width: 1; height: 4 }

        // Barre de chargement
        Rectangle {
            id: loadTrack
            anchors.horizontalCenter: parent.horizontalCenter
            width: 380; height: 6; radius: 3
            color: "#141318"
            border.color: "#2c2a33"; border.width: 1
            Rectangle {
                id: loadFill
                x: 1; y: 1; height: parent.height - 2
                width: 0; radius: 2.5
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: Qt.darker(root.cAccent, 1.8) }
                    GradientStop { position: 1.0; color: root.cAccent }
                }
            }
        }

        Item { width: 1; height: 4 }

        // Auteur
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "créé par Manix"
            color: root.cText
            font.family: root.mono; font.pixelSize: 13; font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "version 5.0   ·   KITT Franco-Belge"
            color: root.cTextDim
            font.family: root.mono; font.pixelSize: 9
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: Config.userName.length > 0
                ? "LICENCE GNU GPL v3   ·   ENREGISTRÉ : " + Config.userName.toUpperCase()
                : "LICENCE GNU GPL v3   ·   LOGICIEL LIBRE"
            color: root.cTextDim
            font.family: root.mono; font.pixelSize: 8; font.bold: true
            font.letterSpacing: 1
        }

        Item { width: 1; height: 8 }

        // --- Section Communaute & Reseaux ---
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "COMMUNAUTÉ & RÉSEAUX"
            color: root.cTextDim
            font.family: root.mono; font.pixelSize: 8; font.bold: true
            font.letterSpacing: 2
        }

        SocialRow {
            id: rowFacebook
            anchors.horizontalCenter: parent.horizontalCenter
            handle: "KITT Franco-Belge"
            glow: "#1877f2"
            link: "https://www.facebook.com/groups/757797724622219/"
            Rectangle {
                anchors.fill: parent
                radius: 8
                color: "#1877f2"
                Text {
                    anchors.centerIn: parent
                    anchors.verticalCenterOffset: 1
                    text: "f"
                    color: "#ffffff"
                    font.family: "DejaVu Sans"
                    font.pixelSize: 22; font.bold: true
                }
            }
        }

        SocialRow {
            id: rowTiktok
            anchors.horizontalCenter: parent.horizontalCenter
            handle: "@KITTK2000"
            glow: "#25f4ee"
            link: "https://www.tiktok.com/@KITTK2000"
            Rectangle {
                anchors.fill: parent
                radius: 8
                color: "#0b0b0d"
                border.color: "#2a2c33"; border.width: 1
                // Note avec decalage chromatique cyan/rouge (signature TikTok)
                Text {
                    anchors.centerIn: parent
                    anchors.horizontalCenterOffset: -2
                    text: "♪"; color: "#25f4ee"
                    font.family: "DejaVu Sans"
                    font.pixelSize: 18; font.bold: true
                }
                Text {
                    anchors.centerIn: parent
                    anchors.horizontalCenterOffset: 2
                    text: "♪"; color: "#fe2c55"
                    font.family: "DejaVu Sans"
                    font.pixelSize: 18; font.bold: true
                }
                Text {
                    anchors.centerIn: parent
                    text: "♪"; color: "#ffffff"
                    font.family: "DejaVu Sans"
                    font.pixelSize: 18; font.bold: true
                }
            }
        }

        SocialRow {
            id: rowInstagram
            anchors.horizontalCenter: parent.horizontalCenter
            handle: "@KITTK2000"
            glow: "#e1306c"
            link: "https://www.instagram.com/kittk2000"
            Rectangle {
                anchors.fill: parent
                radius: 9
                gradient: Gradient {
                    GradientStop { position: 0.0; color: "#feda75" }
                    GradientStop { position: 0.5; color: "#d62976" }
                    GradientStop { position: 1.0; color: "#4f5bd5" }
                }
                // Boitier de l'appareil photo
                Rectangle {
                    anchors.centerIn: parent
                    width: 18; height: 18; radius: 6
                    color: "transparent"
                    border.color: "#ffffff"; border.width: 2
                }
                // Objectif
                Rectangle {
                    anchors.centerIn: parent
                    width: 8; height: 8; radius: 4
                    color: "transparent"
                    border.color: "#ffffff"; border.width: 2
                }
                // Flash
                Rectangle {
                    x: 18; y: 9
                    width: 3.5; height: 3.5; radius: 1.75
                    color: "#ffffff"
                }
            }
        }

        SocialRow {
            id: rowYoutube
            anchors.horizontalCenter: parent.horizontalCenter
            handle: "@KITTK2000"
            glow: "#ff0000"
            link: "https://www.youtube.com/@KITTK2000?sub_confirmation=1"
            Rectangle {
                anchors.fill: parent
                radius: 8
                color: "#ff0000"
                // Triangle "play" YouTube
                Text {
                    anchors.centerIn: parent
                    anchors.horizontalCenterOffset: 1
                    text: "▶"
                    color: "#ffffff"
                    font.family: "DejaVu Sans"
                    font.pixelSize: 14; font.bold: true
                }
            }
        }
    }

    // Invite a cliquer (le splash n'affiche aucun autre repere)
    Text {
        id: clickHint
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 34
        text: "› cliquez pour continuer ‹"
        color: root.cTextDim
        font.family: root.mono; font.pixelSize: 10
        font.letterSpacing: 1
        SequentialAnimation on opacity {
            running: true
            loops: Animation.Infinite
            NumberAnimation { from: 0.3; to: 0.85; duration: 900; easing.type: Easing.InOutSine }
            NumberAnimation { from: 0.85; to: 0.3; duration: 900; easing.type: Easing.InOutSine }
        }
    }

    // --- Sequence : remplir la barre, pause, fondu de sortie ---
    SequentialAnimation {
        id: seq
        running: true
        NumberAnimation {
            target: loadFill; property: "width"
            from: 0; to: loadTrack.width - 2
            duration: 16000; easing.type: Easing.InOutCubic
        }
        PauseAnimation { duration: 2000 }
        NumberAnimation {
            target: root; property: "opacity"
            from: 1.0; to: 0.0
            duration: 2000; easing.type: Easing.InQuad
        }
        ScriptAction { script: { root.visible = false; root.finished(); } }
    }

    // --- Apparition sequentielle des reseaux (fade-in en cascade) ---
    SequentialAnimation {
        id: socialSeq
        running: true
        PauseAnimation { duration: 2200 }
        NumberAnimation {
            target: rowFacebook; property: "opacity"
            from: 0; to: 1; duration: 480; easing.type: Easing.OutCubic
        }
        PauseAnimation { duration: 300 }
        NumberAnimation {
            target: rowTiktok; property: "opacity"
            from: 0; to: 1; duration: 480; easing.type: Easing.OutCubic
        }
        PauseAnimation { duration: 300 }
        NumberAnimation {
            target: rowInstagram; property: "opacity"
            from: 0; to: 1; duration: 480; easing.type: Easing.OutCubic
        }
        PauseAnimation { duration: 300 }
        NumberAnimation {
            target: rowYoutube; property: "opacity"
            from: 0; to: 1; duration: 480; easing.type: Easing.OutCubic
        }
    }
}
