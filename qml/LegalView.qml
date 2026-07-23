// LegalView.qml - lecteur de document integre (Conditions d'utilisation,
// mentions legales...). Affiche un fichier Markdown dans un panneau defilable.
import QtQuick 2.15
import QtQuick.Controls 2.15
import Kyronext 1.0

Item {
    id: root
    visible: false
    z: 50

    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    property string docTitle: ""

    function open(fileUrl, titleText) {
        root.docTitle = titleText;
        _load(fileUrl);
        root.visible = true;
        root.forceActiveFocus();
    }
    function close() {
        root.visible = false;
        if (root.parent)
            root.parent.forceActiveFocus();
    }

    Keys.onEscapePressed: root.close()

    function _load(fileUrl) {
        docText.text = "Chargement...";
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                docText.text = (xhr.responseText && xhr.responseText.length > 0)
                    ? xhr.responseText
                    : "Document introuvable.";
            }
        };
        xhr.open("GET", fileUrl);
        xhr.send();
    }

    // --- Voile sombre ---
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.88
        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.ArrowCursor
            onClicked: root.close()
        }
    }

    // --- Carte ---
    Item {
        id: card
        anchors.centerIn: parent
        width: 640
        height: 520

        MouseArea { anchors.fill: parent }

        Panel {
            anchors.fill: parent
            title: root.docTitle
            accent: root.cAccentSoft

            // Zone de texte defilante
            Flickable {
                id: flick
                anchors.fill: parent
                anchors.bottomMargin: 40
                contentWidth: width
                contentHeight: docText.height
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { width: 8 }

                Text {
                    id: docText
                    width: flick.width - 14
                    textFormat: Text.MarkdownText
                    wrapMode: Text.WordWrap
                    color: root.cText
                    font.family: root.mono
                    font.pixelSize: 11
                    onLinkActivated: Qt.openUrlExternally(link)
                }
            }

            NeonButton {
                anchors.right: parent.right
                anchors.bottom: parent.bottom
                width: 120; height: 30
                label: "FERMER"
                accent: root.cAccentSoft
                onClicked: root.close()
            }
        }
    }
}
