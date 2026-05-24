// SoberView.qml - skin sobre : telechargement + bibliotheque (recherche/tri)
// + mini-lecteur. Tous les boutons en francais. Charge a la demande par main.qml
// via un Loader (Config.soberMode === true).
//
// Conception : layout en colonnes claires, plus de visualiseurs lourds
// (oscilloscope, spectre, tape deck, vumetres analogiques). On s'appuie sur
// le module Library (cote Python) qui filtre/trie le dossier media/.
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import Kyronext 1.0

Item {
    id: root

    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cCyan: "#35e6ff"
    readonly property color cAmber: "#ffc24b"
    readonly property color cGreen: "#54e36b"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    // Suppression : index et titre en cours de confirmation.
    property int pendingDeleteIndex: -1
    property string pendingDeleteName: ""

    function askDelete(idx, name) {
        root.pendingDeleteIndex = idx
        root.pendingDeleteName = name
        deleteDialog.open()
    }

    // Copie vers cle USB : detection au moment du clic puis dialogue.
    property int usbCopyIndex: -1
    property string usbCopyName: ""
    property var usbMountList: []

    function askUsbCopy(idx, name) {
        root.usbCopyIndex = idx
        root.usbCopyName = name
        root.usbMountList = Library.usbMountpoints()
        usbDialog.open()
    }

    function fmtTime(seconds) {
        if (!seconds || seconds < 0 || isNaN(seconds)) return "0:00";
        var total = Math.floor(seconds);
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m + ":" + (s < 10 ? "0" + s : s);
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: 14
        anchors.rightMargin: 14
        anchors.topMargin: 10
        anchors.bottomMargin: 10
        spacing: 8

        // ============================================================
        // BARRE D'OUTILS SUPÉRIEURE (boutons d'action sans chevauchement)
        // ============================================================
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 36

            RowLayout {
                anchors.fill: parent
                spacing: 8

                Text {
                    text: "KYRONEXT STUDIO"
                    color: root.cAccent
                    font.family: root.mono; font.pixelSize: 14; font.bold: true
                }
                Text {
                    text: "KNIGHT INDUSTRIES MEDIA CENTER v5.0"
                    color: root.cTextDim
                    font.family: root.mono; font.pixelSize: 8
                    Layout.alignment: Qt.AlignVCenter
                }
                Item { Layout.fillWidth: true }

                // Tous les actions tiennent dans une seule rangée, sans overlap.
                Repeater {
                    model: [
                        { label: "À PROPOS",   action: "about"   },
                        { label: "♥ DON",      action: "donate"  },
                        { label: "MÀJ",        action: "update"  }
                    ]
                    delegate: Rectangle {
                        Layout.preferredWidth: txt.implicitWidth + 18
                        Layout.preferredHeight: 26
                        radius: 4
                        color: hov.containsMouse ? "#1a1c22" : "#0c0e12"
                        border.color: hov.containsMouse ? root.cAccentSoft : "#26272d"
                        border.width: 1
                        Text {
                            id: txt
                            anchors.centerIn: parent; text: modelData.label
                            color: hov.containsMouse ? root.cAccentSoft : root.cText
                            font.family: root.mono; font.pixelSize: 10; font.bold: true
                        }
                        MouseArea {
                            id: hov; anchors.fill: parent; hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                if (modelData.action === "about") aboutPanel.open()
                                else if (modelData.action === "donate") Qt.openUrlExternally("https://paypal.me/On3egs")
                                else if (modelData.action === "update") Updater.check()
                            }
                        }
                    }
                }

                ChipToggle { label: "MAJ AUTO"; active: Config.autoUpdate;
                    onToggled: Config.autoUpdate = !Config.autoUpdate }
                ChipToggle { label: "LITE"; active: Config.liteMode;
                    onToggled: Config.liteMode = !Config.liteMode }
                ChipToggle { label: "CLASSIQUE"; active: !Config.soberMode;
                    onToggled: Config.soberMode = false }
            }
        }

        // ============================================================
        // TELECHARGER
        // ============================================================
        Panel {
            Layout.fillWidth: true
            Layout.preferredHeight: 116
            title: "TÉLÉCHARGER"; accent: root.cAccentSoft

            ColumnLayout {
                anchors.fill: parent; spacing: 6

                RowLayout {
                    Layout.fillWidth: true; spacing: 6
                    TextField {
                        id: urlField
                        Layout.fillWidth: true
                        Layout.preferredHeight: 28
                        placeholderText: "Coller une URL YouTube..."
                        color: "#ffffff"
                        font.family: root.mono; font.pixelSize: 11
                        selectByMouse: true
                        background: Rectangle {
                            color: "#06070a"
                            border.color: urlField.activeFocus ? root.cAccentSoft : "#26272d"
                            border.width: 1; radius: 3
                        }
                    }
                    NeonButton {
                        Layout.preferredWidth: 80; Layout.preferredHeight: 28
                        label: "COLLER"; accent: root.cCyan
                        onClicked: urlField.text = Shell.clipboard()
                    }
                    NeonButton {
                        Layout.preferredWidth: 130; Layout.preferredHeight: 28
                        label: Downloader.busy ? "ANNULER" : "TÉLÉCHARGER"
                        accent: Downloader.busy ? root.cAccent : root.cGreen
                        onClicked: Downloader.busy ? Downloader.cancel() : Downloader.start(urlField.text, Config.mode, Config.playlist)
                    }
                }

                RowLayout {
                    Layout.fillWidth: true; spacing: 10
                    ChipToggle { label: "VIDÉO"; active: Config.mode === "video"; onToggled: Config.mode = "video" }
                    ChipToggle { label: "MP3"; active: Config.mode === "mp3"; onToggled: Config.mode = "mp3" }
                    ChipToggle { label: "LISTE"; active: Config.playlist; onToggled: Config.playlist = !Config.playlist }
                    Item { Layout.fillWidth: true }
                    Text {
                        visible: Downloader.busy
                        text: Downloader.status + "  " + Downloader.percent + "%   "
                              + Downloader.speed + "   ETA " + Downloader.eta
                        color: root.cAmber; font.family: root.mono; font.pixelSize: 9
                        elide: Text.ElideRight
                    }
                }
            }
        }

        // ============================================================
        // BIBLIOTHÈQUE
        // ============================================================
        Panel {
            Layout.fillWidth: true
            Layout.fillHeight: true
            title: "BIBLIOTHÈQUE  ·  " + Library.count + " / " + Library.totalCount
            accent: root.cAmber

            ColumnLayout {
                anchors.fill: parent; spacing: 6

                // Recherche + filtres + tri
                RowLayout {
                    Layout.fillWidth: true; spacing: 6

                    Rectangle {
                        Layout.preferredWidth: 18; Layout.preferredHeight: 26
                        color: "transparent"
                        Text {
                            anchors.centerIn: parent; text: "⌕"
                            color: root.cTextDim; font.pixelSize: 14
                        }
                    }
                    TextField {
                        id: searchField
                        Layout.fillWidth: true
                        Layout.preferredHeight: 26
                        placeholderText: "Rechercher un titre..."
                        color: "#ffffff"
                        font.family: root.mono; font.pixelSize: 11
                        selectByMouse: true
                        background: Rectangle {
                            color: "#06070a"
                            border.color: searchField.activeFocus ? root.cAmber : "#26272d"
                            border.width: 1; radius: 3
                        }
                        onTextChanged: Library.setQuery(text)
                    }
                    Rectangle {
                        Layout.preferredWidth: 22; Layout.preferredHeight: 26; radius: 3
                        visible: searchField.text.length > 0
                        color: clearHover.containsMouse ? "#1a1c22" : "transparent"
                        border.color: "#26272d"; border.width: 1
                        Text { anchors.centerIn: parent; text: "×"; color: root.cTextDim; font.pixelSize: 12 }
                        MouseArea { id: clearHover; anchors.fill: parent; hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: { searchField.text = ""; Library.setQuery("") }
                        }
                    }
                    Item { Layout.preferredWidth: 8 }

                    Repeater {
                        model: [
                            { id: "all",   label: "TOUS"  },
                            { id: "audio", label: "AUDIO" },
                            { id: "video", label: "VIDÉO" }
                        ]
                        delegate: Rectangle {
                            Layout.preferredWidth: 52; Layout.preferredHeight: 26; radius: 3
                            color: Library.kind === modelData.id ? "#2a0b10"
                                   : (kHover.containsMouse ? "#17151b" : "transparent")
                            border.color: Library.kind === modelData.id ? root.cAccentSoft : "#26272d"
                            border.width: 1
                            Text {
                                anchors.centerIn: parent; text: modelData.label
                                color: Library.kind === modelData.id ? root.cAccent : root.cTextDim
                                font.family: root.mono; font.pixelSize: 9; font.bold: true
                            }
                            MouseArea { id: kHover; anchors.fill: parent; hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Library.setKind(modelData.id)
                            }
                        }
                    }

                    Item { Layout.preferredWidth: 8 }
                    Text { text: "TRI :"; color: root.cTextDim; font.family: root.mono; font.pixelSize: 9 }

                    Repeater {
                        model: [
                            { id: "name",   label: "NOM"     },
                            { id: "recent", label: "RÉCENT"  },
                            { id: "size",   label: "TAILLE"  }
                        ]
                        delegate: Rectangle {
                            Layout.preferredWidth: 60; Layout.preferredHeight: 26; radius: 3
                            color: Library.sortField === modelData.id ? "#0c1a20"
                                   : (sHover.containsMouse ? "#17151b" : "transparent")
                            border.color: Library.sortField === modelData.id ? root.cCyan : "#26272d"
                            border.width: 1
                            Text {
                                anchors.centerIn: parent; text: modelData.label
                                color: Library.sortField === modelData.id ? root.cCyan : root.cTextDim
                                font.family: root.mono; font.pixelSize: 9; font.bold: true
                            }
                            MouseArea { id: sHover; anchors.fill: parent; hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Library.setSort(modelData.id)
                            }
                        }
                    }

                    NeonButton {
                        Layout.preferredWidth: 90; Layout.preferredHeight: 26
                        label: "FICHIERS"; accent: root.cCyan
                        onClicked: Shell.openMediaDir()
                    }
                }

                // En-tête colonnes
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 18
                    color: "#0a0c10"; border.color: "#1a1c22"; border.width: 1; radius: 2
                    RowLayout {
                        anchors.fill: parent; anchors.leftMargin: 8; anchors.rightMargin: 8; spacing: 8
                        Text { text: "TYPE"; Layout.preferredWidth: 50
                            color: root.cTextDim; font.family: root.mono; font.pixelSize: 8; font.bold: true }
                        Text { text: "TITRE"; Layout.fillWidth: true
                            color: root.cTextDim; font.family: root.mono; font.pixelSize: 8; font.bold: true }
                        Text { text: "TAILLE"; Layout.preferredWidth: 70; horizontalAlignment: Text.AlignRight
                            color: root.cTextDim; font.family: root.mono; font.pixelSize: 8; font.bold: true }
                        Text { text: "AJOUTÉ"; Layout.preferredWidth: 100; horizontalAlignment: Text.AlignRight
                            color: root.cTextDim; font.family: root.mono; font.pixelSize: 8; font.bold: true }
                    }
                }

                // Liste défilable
                Rectangle {
                    Layout.fillWidth: true; Layout.fillHeight: true
                    color: "#06070a"; border.color: "#1a1c22"; border.width: 1; radius: 3
                    clip: true

                    ListView {
                        id: libView
                        anchors.fill: parent; anchors.margins: 2
                        model: Library.items
                        spacing: 1; clip: true
                        boundsBehavior: Flickable.StopAtBounds

                        ScrollBar.vertical: ScrollBar {
                            policy: ScrollBar.AsNeeded
                            contentItem: Rectangle {
                                implicitWidth: 4; radius: 2
                                color: root.cTextDim; opacity: 0.5
                            }
                        }

                        delegate: Rectangle {
                            id: row
                            width: libView.width
                            height: 24
                            readonly property bool isCurrent: Player.state !== "stopped"
                                                              && Player.currentTitle === modelData.name
                            color: isCurrent ? "#2a0b10"
                                   : (rowHover.containsMouse ? "#141318"
                                      : (index % 2 === 0 ? "transparent" : "#08090c"))

                            Rectangle {
                                width: 2; height: parent.height
                                color: row.isCurrent ? root.cAmber : "transparent"
                            }

                            // MouseArea declaree AVANT le RowLayout : les boutons
                            // (USB / supprimer) sont declares apres et passent donc au-dessus
                            // dans le hit-testing. rowHover ne capte que les clics hors boutons.
                            MouseArea {
                                id: rowHover
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Library.activate(index)
                                onDoubleClicked: Library.activate(index)
                            }

                            RowLayout {
                                anchors.fill: parent
                                anchors.leftMargin: 10; anchors.rightMargin: 10
                                spacing: 8

                                Rectangle {
                                    Layout.preferredWidth: 42; Layout.preferredHeight: 14; radius: 2
                                    color: modelData.kind === "audio" ? "#0c2a18" : "#2a1018"
                                    border.color: modelData.kind === "audio" ? root.cGreen : root.cAccentSoft
                                    border.width: 1
                                    Text {
                                        anchors.centerIn: parent
                                        text: modelData.kind === "audio" ? "AUDIO" : "VIDÉO"
                                        color: modelData.kind === "audio" ? root.cGreen : root.cAccentSoft
                                        font.family: root.mono; font.pixelSize: 7; font.bold: true
                                    }
                                }
                                Text {
                                    Layout.fillWidth: true
                                    text: modelData.name
                                    color: row.isCurrent ? "#ffffff"
                                           : (rowHover.containsMouse ? "#c2c8ce" : "#a3acb5")
                                    font.family: root.mono; font.pixelSize: 11
                                    elide: Text.ElideRight
                                }
                                Text {
                                    Layout.preferredWidth: 70
                                    text: modelData.size
                                    horizontalAlignment: Text.AlignRight
                                    color: root.cTextDim; font.family: root.mono; font.pixelSize: 9
                                }
                                Text {
                                    Layout.preferredWidth: 100
                                    text: modelData.age
                                    horizontalAlignment: Text.AlignRight
                                    color: root.cTextDim; font.family: root.mono; font.pixelSize: 9
                                }
                                // Bouton copier vers USB (survol uniquement).
                                // z:5 pour passer au-dessus de rowHover (declare apres) qui
                                // sinon intercepterait le clic.
                                Rectangle {
                                    z: 5
                                    Layout.preferredWidth: 34; Layout.preferredHeight: 18; radius: 3
                                    visible: rowHover.containsMouse || usbHover.containsMouse || delHover.containsMouse
                                    color: usbHover.containsMouse ? root.cCyan : "#0a2030"
                                    border.color: root.cCyan; border.width: 1
                                    Text {
                                        anchors.centerIn: parent; text: "USB"
                                        color: usbHover.containsMouse ? "#000000" : root.cCyan
                                        font.family: root.mono; font.pixelSize: 8; font.bold: true
                                    }
                                    MouseArea {
                                        id: usbHover; anchors.fill: parent; hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.askUsbCopy(index, modelData.name)
                                    }
                                }
                                // Bouton supprimer (survol uniquement)
                                Rectangle {
                                    z: 5
                                    Layout.preferredWidth: 22; Layout.preferredHeight: 18; radius: 3
                                    visible: rowHover.containsMouse || delHover.containsMouse || usbHover.containsMouse
                                    color: delHover.containsMouse ? root.cAccent : "#2a0b10"
                                    border.color: root.cAccent; border.width: 1
                                    Text {
                                        anchors.centerIn: parent; text: "×"
                                        color: delHover.containsMouse ? "#ffffff" : root.cAccent
                                        font.family: root.mono; font.pixelSize: 12; font.bold: true
                                    }
                                    MouseArea {
                                        id: delHover; anchors.fill: parent; hoverEnabled: true
                                        cursorShape: Qt.PointingHandCursor
                                        onClicked: root.askDelete(index, modelData.name)
                                    }
                                }
                            }
                        }

                        Text {
                            anchors.centerIn: parent
                            visible: Library.count === 0
                            text: searchField.text.length > 0
                                  ? "Aucun fichier ne correspond à \"" + searchField.text + "\""
                                  : (Library.totalCount === 0
                                     ? "Aucun média : commence par télécharger une URL."
                                     : "Aucun fichier dans ce filtre.")
                            color: root.cTextDim; font.family: root.mono; font.pixelSize: 10
                        }
                    }
                }
            }
        }

        // ============================================================
        // MINI LECTEUR
        // ============================================================
        Panel {
            Layout.fillWidth: true
            Layout.preferredHeight: 80
            title: ""
            accent: root.cAmber

            RowLayout {
                anchors.fill: parent
                anchors.margins: 4
                spacing: 12

                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 8

                        NeonButton { Layout.preferredWidth: 38; Layout.preferredHeight: 26;
                            label: "<<"; accent: root.cAmber; onClicked: Player.previous() }
                        NeonButton { Layout.preferredWidth: 44; Layout.preferredHeight: 26;
                            label: Player.state === "playing" ? "||" : ">"
                            accent: root.cGreen; onClicked: Player.toggle() }
                        NeonButton { Layout.preferredWidth: 38; Layout.preferredHeight: 26;
                            label: ">>"; accent: root.cAmber; onClicked: Player.next() }

                        ColumnLayout {
                            Layout.fillWidth: true; spacing: 0
                            Text {
                                Layout.fillWidth: true
                                text: Player.currentTitle === "AUCUNE PISTE" ? "Aucune piste sélectionnée" : Player.currentTitle
                                color: Player.state === "playing" ? "#ffffff" : root.cTextDim
                                font.family: root.mono; font.pixelSize: 12; font.bold: true
                                elide: Text.ElideRight
                            }
                            Text {
                                text: root.fmtTime(Player.position) + "  /  " + root.fmtTime(Player.duration)
                                color: root.cAmber; font.family: root.mono; font.pixelSize: 9
                            }
                        }

                        VolumeControl { Layout.preferredWidth: 130; accent: root.cAmber }
                    }

                    // Barre de progression cliquable
                    Rectangle {
                        Layout.fillWidth: true; Layout.preferredHeight: 5; radius: 2.5
                        color: "#141318"; border.color: "#26272d"; border.width: 1
                        Rectangle {
                            x: 1; y: 1
                            width: Math.max(0, (parent.width - 2)
                                   * (Player.duration > 0 ? Player.position / Player.duration : 0))
                            height: parent.height - 2; radius: 1.5
                            gradient: Gradient {
                                orientation: Gradient.Horizontal
                                GradientStop { position: 0.0; color: Qt.darker(root.cAmber, 1.7) }
                                GradientStop { position: 1.0; color: root.cAmber }
                            }
                        }
                        MouseArea { anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: Player.seek(mouse.x / width)
                        }
                    }

                    // VU LED léger (L/R)
                    RowLayout {
                        Layout.fillWidth: true; spacing: 8
                        Text { text: "L"; color: root.cTextDim; font.family: root.mono; font.pixelSize: 7 }
                        Row {
                            Layout.fillWidth: true; spacing: 1
                            Repeater {
                                model: 32
                                Rectangle {
                                    width: (parent.width - 31) / 32; height: 4; radius: 1
                                    property real threshold: (index + 1) / 32.0
                                    color: index < 22 ? root.cGreen : (index < 28 ? root.cAmber : root.cAccent)
                                    opacity: Player.vuLeft > threshold ? 0.9 : 0.12
                                }
                            }
                        }
                    }
                    RowLayout {
                        Layout.fillWidth: true; spacing: 8
                        Text { text: "R"; color: root.cTextDim; font.family: root.mono; font.pixelSize: 7 }
                        Row {
                            Layout.fillWidth: true; spacing: 1
                            Repeater {
                                model: 32
                                Rectangle {
                                    width: (parent.width - 31) / 32; height: 4; radius: 1
                                    property real threshold: (index + 1) / 32.0
                                    color: index < 22 ? root.cGreen : (index < 28 ? root.cAmber : root.cAccent)
                                    opacity: Player.vuRight > threshold ? 0.9 : 0.12
                                }
                            }
                        }
                    }
                }

                Rectangle {
                    Layout.preferredWidth: 1; Layout.fillHeight: true
                    color: "#1a1c22"; opacity: 0.5
                }

                // Métriques système compactes (toujours visibles)
                Grid {
                    Layout.preferredWidth: 250
                    Layout.fillHeight: true
                    columns: 4
                    rowSpacing: 4
                    columnSpacing: 12
                    Repeater {
                        model: [
                            { label: "CPU",  val: Metrics.cpu,  unit: "%", max: 100, color: root.cCyan },
                            { label: "GPU",  val: Metrics.gpu,  unit: "%", max: 100, color: root.cGreen },
                            { label: "RAM",  val: Metrics.ram,  unit: "%", max: 100, color: root.cAccentSoft },
                            { label: "TEMP", val: Metrics.temp, unit: "°C", max: 100, color: root.cAmber }
                        ]
                        delegate: Column {
                            spacing: 1
                            Text {
                                text: modelData.label
                                color: root.cTextDim; font.family: root.mono; font.pixelSize: 7
                            }
                            Text {
                                text: Math.round(modelData.val) + modelData.unit
                                color: "#ffffff"; font.family: root.mono; font.pixelSize: 11; font.bold: true
                            }
                            Rectangle {
                                width: 50; height: 2; radius: 1
                                color: "#1a1c22"
                                Rectangle {
                                    width: Math.min(parent.width, parent.width * (modelData.val / modelData.max))
                                    height: parent.height; radius: 1
                                    color: modelData.color
                                }
                            }
                        }
                    }
                }
            }
        }

        // Ligne scanner fine (l'unique animation du mode sobre)
        Rectangle {
            id: scanTrack
            Layout.fillWidth: true; Layout.preferredHeight: 2; radius: 1
            color: "#0a0305"; clip: true
            Rectangle {
                width: 60; height: 2; x: -60
                gradient: Gradient {
                    orientation: Gradient.Horizontal
                    GradientStop { position: 0.0; color: "transparent" }
                    GradientStop { position: 0.5; color: root.cAccent }
                    GradientStop { position: 1.0; color: "transparent" }
                }
                PropertyAnimation on x {
                    from: -60; to: scanTrack.width; duration: 2200
                    loops: Animation.Infinite; running: !Config.liteMode
                }
            }
        }
    }

    // Dialogue de confirmation pour la suppression depuis le disque.
    Dialog {
        id: deleteDialog
        anchors.centerIn: parent
        width: 460; modal: true
        background: Rectangle {
            color: "#0c0e12"; border.color: root.cAccent; border.width: 1; radius: 6
        }
        contentItem: Column {
            spacing: 12
            Text {
                text: "Supprimer du disque ?"
                color: root.cAccent
                font.family: root.mono; font.pixelSize: 13; font.bold: true
                width: parent.width
            }
            Text {
                text: "« " + root.pendingDeleteName + " »"
                color: "#ffffff"
                font.family: root.mono; font.pixelSize: 11
                width: parent.width; wrapMode: Text.Wrap
            }
            Text {
                text: "Cette action est définitive : le fichier sera supprimé\nde " + Qt.application.name + " et du dossier media/."
                color: root.cTextDim
                font.family: root.mono; font.pixelSize: 9
                width: parent.width; wrapMode: Text.Wrap
            }
            Row {
                spacing: 8
                NeonButton {
                    width: 110; height: 28
                    label: "SUPPRIMER"; accent: root.cAccent
                    onClicked: {
                        if (root.pendingDeleteIndex >= 0)
                            Library.deleteAt(root.pendingDeleteIndex)
                        root.pendingDeleteIndex = -1
                        deleteDialog.close()
                    }
                }
                NeonButton {
                    width: 90; height: 28
                    label: "ANNULER"; accent: root.cCyan
                    onClicked: { root.pendingDeleteIndex = -1; deleteDialog.close() }
                }
            }
        }
    }

    // Dialogue de copie vers cle USB.
    Dialog {
        id: usbDialog
        anchors.centerIn: parent
        width: 480; modal: true
        background: Rectangle {
            color: "#0c0e12"; border.color: root.cCyan; border.width: 1; radius: 6
        }
        contentItem: Column {
            spacing: 10
            Text {
                text: "Copier vers une clé USB"
                color: root.cCyan
                font.family: root.mono; font.pixelSize: 13; font.bold: true
                width: parent.width
            }
            Text {
                text: "« " + root.usbCopyName + " »"
                color: "#ffffff"
                font.family: root.mono; font.pixelSize: 11
                width: parent.width; wrapMode: Text.Wrap
            }
            // Cas 1 : aucune cle detectee
            Text {
                visible: root.usbMountList.length === 0
                text: "Aucune clé USB détectée. Branche une clé puis réessaie\n"
                      + "(/media/" + Qt.application.organization + "/, /run/media/...)."
                color: root.cAccent
                font.family: root.mono; font.pixelSize: 10
                width: parent.width; wrapMode: Text.Wrap
            }
            // Cas 2+ : on liste les cles, un clic = copie
            Repeater {
                model: root.usbMountList
                delegate: Rectangle {
                    width: parent.width; height: 34; radius: 4
                    color: usbItemHover.containsMouse ? "#1a2a30" : "#0a0c10"
                    border.color: root.cCyan; border.width: 1
                    Row {
                        anchors.fill: parent
                        anchors.leftMargin: 10; anchors.rightMargin: 10
                        spacing: 8
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: "→"
                            color: root.cCyan
                            font.family: root.mono; font.pixelSize: 14; font.bold: true
                        }
                        Text {
                            anchors.verticalCenter: parent.verticalCenter
                            text: modelData
                            color: "#ffffff"
                            font.family: root.mono; font.pixelSize: 10
                        }
                    }
                    MouseArea {
                        id: usbItemHover
                        anchors.fill: parent; hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            var dest = Library.copyToUsb(root.usbCopyIndex, modelData)
                            usbResult.text = dest.length > 0
                                ? "Copié vers : " + dest
                                : "Échec de la copie."
                            usbResult.color = dest.length > 0 ? root.cGreen : root.cAccent
                        }
                    }
                }
            }
            Text {
                id: usbResult
                text: ""
                visible: text.length > 0
                font.family: root.mono; font.pixelSize: 10
                width: parent.width; wrapMode: Text.Wrap
            }
            Row {
                spacing: 8
                NeonButton {
                    width: 90; height: 28
                    label: "FERMER"; accent: root.cCyan
                    onClicked: {
                        root.usbCopyIndex = -1
                        root.usbMountList = []
                        usbResult.text = ""
                        usbDialog.close()
                    }
                }
            }
        }
    }
}
