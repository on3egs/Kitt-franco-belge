// NamePrompt.qml - demande le prenom de l'utilisateur au premier lancement.
// Une fois renseigne, il est memorise (Config.userName) et n'est plus redemande.
import QtQuick 2.15
import QtQuick.Controls 2.15
import Kyronext 1.0

Item {
    id: root
    visible: false
    z: 600

    // Emis quand l'utilisateur a valide un prenom non vide.
    signal confirmed(string name)

    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    function open() {
        nameField.text = Config.userName;
        root.visible = true;
        nameField.forceActiveFocus();
        nameField.selectAll();
    }
    function _submit() {
        var n = nameField.text.trim();
        if (n.length === 0)
            return;
        
        // Détection des gros mots - KARR répond si trouvé
        if (KarrPlayer.checkAndPlay(n)) {
            // Gros mot détecté, on laisse KARR répondre mais on accepte quand même
            console.log("[KARR] Gros mot détecté dans le prénom");
        }
        
        Config.userName = n;
        root.visible = false;
        root.confirmed(n);
    }

    // Voile sombre - absorbe tous les clics (le splash dessous reste inaccessible)
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.93
        MouseArea { anchors.fill: parent }
    }

    // Carte centrale
    Rectangle {
        anchors.centerIn: parent
        width: 430
        height: 252
        color: "#0c0e12"
        border.color: root.cAccent
        border.width: 1
        radius: 6

        Column {
            anchors.centerIn: parent
            width: parent.width - 56
            spacing: 14

            Text {
                anchors.horizontalCenter: parent.horizontalCenter
                text: "KYRONEXT STUDIO"
                color: root.cAccent
                font.family: root.mono; font.pixelSize: 16; font.bold: true
            }
            Text {
                width: parent.width
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.WordWrap
                text: "Comment dois-je vous appeler ?\n"
                    + "Votre prénom est mémorisé pour vous accueillir à chaque lancement."
                color: root.cTextDim
                font.family: root.mono; font.pixelSize: 10
                lineHeight: 1.3
            }

            TextField {
                id: nameField
                width: parent.width
                height: 34
                color: "#ffffff"
                font.family: root.mono; font.pixelSize: 13
                placeholderText: "Votre prénom..."
                background: Rectangle {
                    color: "#06070a"
                    border.color: nameField.activeFocus ? root.cAccent : "#3d1117"
                    border.width: 1
                    radius: 3
                }
                Keys.onReturnPressed: root._submit()
                Keys.onEnterPressed: root._submit()
            }

            NeonButton {
                anchors.horizontalCenter: parent.horizontalCenter
                width: 170; height: 34
                label: "VALIDER"
                accent: root.cAccent
                enabled: nameField.text.trim().length > 0
                opacity: enabled ? 1.0 : 0.4
                onClicked: root._submit()
            }
        }
    }
}
