// AboutPanel.qml - Panneau « A propos » : presentation de l'auteur et
// soutien au projet (don PayPal). Ouvert depuis le bouton A PROPOS de l'en-tete.
import QtQuick 2.15
import QtQuick.Layouts 1.15
import Kyronext 1.0

Item {
    id: root
    visible: false
    z: 300

    // Palette alignee sur main.qml
    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cGreen: "#54e36b"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"
    readonly property string donateUrl: "https://paypal.me/On3egs"

    // Emis quand l'utilisateur demande a corriger son prenom enregistre.
    signal editNameRequested()

    function open() { root.visible = true; root.forceActiveFocus(); }
    function close() { root.visible = false; }

    Keys.onEscapePressed: root.close()

    // --- Voile sombre (clic exterieur = fermeture) ---
    Rectangle {
        anchors.fill: parent
        color: "#000000"
        opacity: 0.82
        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.ArrowCursor
            onClicked: root.close()
        }
    }

    // --- Carte centrale ---
    Item {
        id: card
        anchors.centerIn: parent
        width: 660
        height: 460

        // Absorbe les clics : cliquer la carte ne la ferme pas
        MouseArea { anchors.fill: parent }

        Panel {
            anchors.fill: parent
            title: "À PROPOS"
            accent: root.cAccent

            RowLayout {
                anchors.fill: parent
                spacing: 16

                // --- Portrait de l'auteur ---
                Rectangle {
                    Layout.preferredWidth: 200
                    Layout.fillHeight: true
                    color: "#06070a"
                    border.width: 1
                    border.color: Qt.rgba(root.cAccent.r, root.cAccent.g,
                                          root.cAccent.b, 0.30)
                    Image {
                        anchors.fill: parent
                        anchors.margins: 3
                        source: "../assets/manix.png"
                        fillMode: Image.PreserveAspectCrop
                        smooth: true
                    }
                }

                // --- Presentation + soutien ---
                ColumnLayout {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    spacing: 7

                    Text {
                        text: "MANIX"
                        color: root.cAccent
                        font.family: root.mono; font.pixelSize: 18; font.bold: true
                    }
                    Text {
                        text: "Emmanuel Gelinne — auteur & développeur"
                        color: root.cTextDim
                        font.family: root.mono; font.pixelSize: 9; font.bold: true
                    }

                    Rectangle {
                        Layout.fillWidth: true; Layout.preferredHeight: 1
                        color: "#2a1218"
                    }

                    // Texte de presentation - Manix reste libre de l'ajuster.
                    Text {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        wrapMode: Text.WordWrap
                        verticalAlignment: Text.AlignTop
                        color: root.cText
                        font.family: root.mono; font.pixelSize: 11
                        lineHeight: 1.32
                        text: "Programmeur autodidacte depuis l'enfance, initié au "
                            + "BASIC sur un Schneider CPC 464. Passionné d'informatique "
                            + "et d'intelligence artificielle, il conçoit KITT, un "
                            + "assistant vocal embarqué fonctionnant entièrement en "
                            + "local sur du matériel open source.\n\n"
                            + "Kyronext Studio est l'un de ses projets : un media "
                            + "center libre et soigné, offert à la communauté "
                            + "KITT Franco-Belge."
                    }

                    Rectangle {
                        Layout.fillWidth: true; Layout.preferredHeight: 1
                        color: "#2a1218"
                    }

                    Text {
                        Layout.fillWidth: true
                        wrapMode: Text.WordWrap
                        color: root.cTextDim
                        font.family: root.mono; font.pixelSize: 9
                        text: "Logiciel libre et gratuit, sous licence GNU GPL v3. "
                            + "Pour soutenir son développement, vous pouvez faire un don :"
                    }

                    // Licence « enregistree » au nom de l'utilisateur (touche pro).
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 6
                        visible: Config.userName.length > 0
                        Text {
                            text: "Licence enregistrée au nom de"
                            color: root.cTextDim
                            font.family: root.mono; font.pixelSize: 9
                        }
                        Text {
                            text: Config.userName
                            color: root.cAccentSoft
                            font.family: root.mono; font.pixelSize: 9; font.bold: true
                        }
                        Text {
                            text: "· modifier"
                            color: editMouse.containsMouse ? root.cAccentSoft
                                                           : root.cTextDim
                            font.family: root.mono; font.pixelSize: 9
                            font.underline: editMouse.containsMouse
                            MouseArea {
                                id: editMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: { root.close(); root.editNameRequested(); }
                            }
                        }
                        Item { Layout.fillWidth: true }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        NeonButton {
                            Layout.preferredWidth: 230
                            Layout.preferredHeight: 40
                            label: "FAIRE UN DON — PAYPAL"
                            accent: root.cGreen
                            onClicked: Qt.openUrlExternally(root.donateUrl)
                        }

                        Text {
                            id: linkText
                            Layout.fillWidth: true
                            text: "paypal.me/On3egs"
                            color: linkMouse.containsMouse ? root.cGreen
                                                           : root.cTextDim
                            font.family: root.mono; font.pixelSize: 11
                            font.underline: linkMouse.containsMouse
                            elide: Text.ElideRight
                            MouseArea {
                                id: linkMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Qt.openUrlExternally(root.donateUrl)
                            }
                        }
                    }

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        Text {
                            text: "Conditions d'utilisation"
                            color: condMouse.containsMouse ? root.cAccentSoft
                                                           : root.cTextDim
                            font.family: root.mono; font.pixelSize: 10
                            font.underline: condMouse.containsMouse
                            MouseArea {
                                id: condMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: legalView.open(
                                    Qt.resolvedUrl("../CONDITIONS_UTILISATION.md"),
                                    "CONDITIONS D'UTILISATION")
                            }
                        }

                        Item { Layout.fillWidth: true }

                        NeonButton {
                            Layout.preferredWidth: 120
                            Layout.preferredHeight: 30
                            label: "FERMER"
                            accent: root.cAccentSoft
                            onClicked: root.close()
                        }
                    }
                }
            }
        }
    }

    // --- Lecteur de document legal (par-dessus le panneau) ---
    LegalView { id: legalView; anchors.fill: parent }
}
