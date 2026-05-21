// main.qml - fenetre principale de Kyronext-Studio.
//
// L'interface est purement declarative : elle se "branche" sur les objets
// Python (Downloader, Player, Metrics...) exposes par app.py. Les animations
// (vumetres, jauges, fond) sont rendues par le GPU via le scene graph QML.
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import Kyronext 1.0

ApplicationWindow {
    id: win
    visible: true
    width: 1180
    height: 900
    minimumWidth: 980
    minimumHeight: 640
    title: "Kyronext-Studio"
    color: "#040506"

    // --- palette KARR partagee -----------------------------------------
    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cCyan: "#35e6ff"
    readonly property color cAmber: "#ffc24b"
    readonly property color cGreen: "#54e36b"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    property string lastMedia: Shell.lastMediaName()

    function fmtTime(s) {
        s = Math.max(0, Math.floor(s));
        var m = Math.floor(s / 60);
        var sec = s % 60;
        return (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
    }

    // --- fond anime -----------------------------------------------------
    Background {
        anchors.fill: parent
        energy: Player.bass
        lite: Config.liteMode
    }

    // --- journal et evenements -----------------------------------------
    ListModel { id: logModel }

    function logAppend(line) {
        logModel.append({ "line": line });
        while (logModel.count > 400)
            logModel.remove(0);
        logView.positionViewAtEnd();
    }

    Connections {
        target: Downloader
        function onLogLine(line) { win.logAppend(line); }
        function onFinished(ok, message) {
            win.logAppend((ok ? "[OK] " : "[ERREUR] ") + message);
            Player.scan();
            win.lastMedia = Shell.lastMediaName();
        }
    }
    Connections {
        target: Deps
        function onLogLine(line) { win.logAppend(line); }
    }

    // ===================================================================
    ScrollView {
        id: scroller
        anchors.fill: parent
        contentWidth: availableWidth
        clip: true
        ScrollBar.horizontal.policy: ScrollBar.AlwaysOff

        Column {
            id: col
            width: scroller.availableWidth
            spacing: 8
            topPadding: 12
            bottomPadding: 16

            // ---------- EN-TETE ----------
            Item {
                x: 14
                width: col.width - 28
                height: 78

                Column {
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 2
                    Row {
                        Text {
                            text: "KYRONEXT"
                            color: win.cAccent
                            font.family: win.mono; font.pixelSize: 31; font.bold: true
                        }
                        Text {
                            text: " STUDIO"
                            color: "#ff8088"
                            font.family: win.mono; font.pixelSize: 31; font.bold: true
                        }
                    }
                    Rectangle { width: 318; height: 1; color: "#6e0a12" }
                    Text {
                        text: "by Manix    -    KITT FRANCO-BELGE    -    SYSOP 1990"
                        color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 10; font.bold: true
                    }
                }

                Row {
                    anchors.right: parent.right
                    anchors.verticalCenter: parent.verticalCenter
                    spacing: 8
                    ChipToggle {
                        anchors.verticalCenter: parent.verticalCenter
                        label: "AUTO-UPDATE"
                        accent: win.cGreen
                        active: Config.autoUpdate
                        onToggled: Config.autoUpdate = !Config.autoUpdate
                    }
                    ChipToggle {
                        anchors.verticalCenter: parent.verticalCenter
                        label: "MODE LITE"
                        accent: win.cCyan
                        active: Config.liteMode
                        onToggled: Config.liteMode = !Config.liteMode
                    }
                    Image {
                        anchors.verticalCenter: parent.verticalCenter
                        source: Shell.phoenixSource
                        visible: Shell.phoenixSource !== ""
                        fillMode: Image.PreserveAspectFit
                        sourceSize.height: 76
                        height: 76
                        opacity: 0.9
                    }
                }
            }

            // ---------- SCANNER KARR ----------
            Rectangle {
                id: scannerBar
                x: 14
                width: col.width - 28
                height: 7
                radius: 3.5
                color: "#0a0305"
                border.color: "#1c0609"
                border.width: 1

                property real sweep: 0.0
                NumberAnimation on sweep {
                    from: 0; to: 1; duration: 1500
                    loops: Animation.Infinite
                    easing.type: Easing.InOutSine
                }
                Rectangle {
                    id: blob
                    width: Math.max(70, scannerBar.width * 0.11)
                    height: parent.height - 2
                    y: 1
                    radius: height / 2
                    x: (scannerBar.width - width) *
                       (scannerBar.sweep < 0.5
                        ? scannerBar.sweep * 2
                        : (1 - scannerBar.sweep) * 2)
                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0.0; color: "transparent" }
                        GradientStop { position: 0.5; color: "#ff2233" }
                        GradientStop { position: 1.0; color: "transparent" }
                    }
                }
            }

            // ---------- CIBLE YOUTUBE ----------
            Panel {
                x: 14
                width: col.width - 28
                title: "YOUTUBE TARGET"
                accent: win.cAccentSoft

                Column {
                    width: parent.width
                    spacing: 8

                    // Banniere d'aide aux dependances manquantes.
                    Rectangle {
                        id: depBanner
                        visible: Deps.missing.length > 0
                        width: parent.width
                        height: visible ? 42 : 0
                        radius: 5
                        color: "#1c0c0e"
                        border.color: win.cAccent
                        border.width: 1

                        Text {
                            anchors {
                                left: parent.left; leftMargin: 12
                                right: instBtn.left; rightMargin: 10
                                verticalCenter: parent.verticalCenter
                            }
                            text: Deps.hint
                            color: "#ffb3ba"
                            font.family: win.mono; font.pixelSize: 9; font.bold: true
                            wrapMode: Text.WordWrap
                            maximumLineCount: 2
                            elide: Text.ElideRight
                        }
                        NeonButton {
                            id: instBtn
                            anchors {
                                right: parent.right; rightMargin: 8
                                verticalCenter: parent.verticalCenter
                            }
                            width: 112; height: 28
                            label: "INSTALLER"
                            accent: win.cAccent
                            visible: Deps.missing.indexOf("yt-dlp") >= 0
                            onClicked: Deps.installYtDlp()
                        }
                    }

                    // Ligne de saisie d'URL.
                    Row {
                        width: parent.width
                        spacing: 8
                        TextField {
                            id: urlField
                            width: parent.width - 130
                            height: 44
                            placeholderText: "https://www.youtube.com/watch?v=..."
                            placeholderTextColor: "#55606a"
                            color: "#ffffff"
                            font.family: win.mono; font.pixelSize: 12
                            selectByMouse: true
                            verticalAlignment: TextInput.AlignVCenter
                            leftPadding: 12
                            background: Rectangle {
                                color: "#06070a"
                                radius: 4
                                border.width: 2
                                border.color: urlField.activeFocus
                                              ? win.cAccent : "#3d1117"
                            }
                            Keys.onReturnPressed: dlButton.clicked()
                        }
                        NeonButton {
                            width: 120; height: 44
                            label: "COLLER"
                            accent: win.cCyan
                            onClicked: urlField.text = Shell.clipboard()
                        }
                    }

                    // Options de telechargement.
                    Row {
                        width: parent.width
                        spacing: 8
                        ChipToggle {
                            label: "VIDEO MP4"
                            accent: win.cAccent
                            active: Config.mode === "video"
                            onToggled: Config.mode = "video"
                        }
                        ChipToggle {
                            label: "MP3 AUDIO"
                            accent: win.cAmber
                            active: Config.mode === "mp3"
                            onToggled: Config.mode = "mp3"
                        }
                        ChipToggle {
                            label: "PLAYLIST COMPLETE"
                            accent: win.cCyan
                            active: Config.playlist
                            onToggled: Config.playlist = !Config.playlist
                        }
                    }

                    // Boutons d'action.
                    Item {
                        width: parent.width
                        height: 44
                        Row {
                            anchors.left: parent.left
                            spacing: 8
                            NeonButton {
                                id: dlButton
                                width: 170; height: 44
                                label: "DOWNLOAD"
                                accent: win.cAccent
                                enabled: !Downloader.busy
                                onClicked: {
                                    var u = urlField.text.trim();
                                    if (u.length > 0)
                                        Downloader.start(u, Config.mode,
                                                         Config.playlist);
                                }
                            }
                            NeonButton {
                                width: 120; height: 44
                                label: "ABORT"
                                accent: "#9a2530"
                                enabled: Downloader.busy
                                onClicked: Downloader.cancel()
                            }
                        }
                        Row {
                            anchors.right: parent.right
                            spacing: 8
                            NeonButton {
                                width: 128; height: 44
                                label: "MEDIA DIR"
                                accent: win.cCyan
                                onClicked: Shell.openMediaDir()
                            }
                            NeonButton {
                                width: 150; height: 44
                                label: "OPEN LAST"
                                accent: win.cCyan
                                onClicked: Shell.openLast()
                            }
                        }
                    }
                }
            }

            // ---------- TRANSFERT ----------
            Panel {
                x: 14
                width: col.width - 28
                title: "TRANSFER"
                accent: win.cAccentSoft

                Column {
                    width: parent.width
                    spacing: 8

                    Text {
                        text: Downloader.status
                        color: win.cAccent
                        font.family: win.mono; font.pixelSize: 12; font.bold: true
                    }

                    // Barre de progression du telechargement.
                    Rectangle {
                        width: parent.width
                        height: 24
                        radius: 4
                        color: "#070809"
                        border.color: "#341017"
                        border.width: 1
                        Rectangle {
                            x: 2
                            anchors.verticalCenter: parent.verticalCenter
                            height: parent.height - 4
                            width: Math.max(0, (parent.width - 4)
                                            * Downloader.percent / 100)
                            radius: 3
                            gradient: Gradient {
                                orientation: Gradient.Horizontal
                                GradientStop { position: 0.0; color: "#7a0010" }
                                GradientStop { position: 1.0; color: "#ff2a3a" }
                            }
                            Behavior on width {
                                NumberAnimation {
                                    duration: 220; easing.type: Easing.OutCubic
                                }
                            }
                        }
                        Text {
                            anchors.centerIn: parent
                            text: Downloader.percent.toFixed(1) + " %"
                            color: "#ffffff"
                            font.family: win.mono; font.pixelSize: 11; font.bold: true
                        }
                    }

                    // Quatre lectures synthetiques.
                    Row {
                        id: readoutRow
                        width: parent.width
                        spacing: 8
                        Repeater {
                            model: 4
                            delegate: Rectangle {
                                width: (readoutRow.width - 24) / 4
                                height: 52
                                radius: 4
                                color: "#07080a"
                                border.color: "#352026"
                                border.width: 1
                                Column {
                                    anchors.centerIn: parent
                                    spacing: 3
                                    Text {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        text: ["PROGRESS", "SPEED", "ETA", "SIZE"][index]
                                        color: win.cTextDim
                                        font.family: win.mono
                                        font.pixelSize: 8; font.bold: true
                                    }
                                    Text {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        text: index === 0
                                              ? Downloader.percent.toFixed(1) + " %"
                                              : index === 1 ? Downloader.speed
                                              : index === 2 ? Downloader.eta
                                              : Downloader.size
                                        color: win.cAccentSoft
                                        font.family: win.mono
                                        font.pixelSize: 13; font.bold: true
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // ---------- CORE MONITOR : 4 JAUGES + 2 VUMETRES ----------
            Panel {
                x: 14
                width: col.width - 28
                title: "CORE MONITOR"
                accent: win.cCyan

                Column {
                    width: parent.width
                    spacing: 8

                    Text {
                        text: "TELEMETRIE SYSTEME TEMPS REEL"
                        color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 9; font.bold: true
                    }

                    // Les quatre compteurs independants.
                    RowLayout {
                        width: parent.width
                        height: 158
                        spacing: 8
                        Gauge {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 158
                            label: "UPLOAD"
                            unit: "Mo/s"
                            value: Metrics.netUp
                            autoScale: true
                            decimals: 2
                            accent: win.cCyan
                        }
                        Gauge {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 158
                            label: "DOWNLOAD"
                            unit: "Mo/s"
                            value: Metrics.netDown
                            autoScale: true
                            decimals: 2
                            accent: win.cAccent
                        }
                        Gauge {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 158
                            label: "PUISSANCE"
                            unit: "WATTS"
                            value: Metrics.power
                            maxValue: 65
                            decimals: 1
                            accent: win.cAmber
                        }
                        Gauge {
                            Layout.fillWidth: true
                            Layout.preferredHeight: 158
                            label: "GPU"
                            unit: "%"
                            value: Metrics.gpu
                            maxValue: 100
                            decimals: 0
                            accent: win.cGreen
                        }
                    }

                    // Lectures complementaires.
                    Text {
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                        text: "GPU " + Metrics.temp.toFixed(0) + " C     "
                              + "CPU " + Metrics.cpu.toFixed(0) + " %     "
                              + "RAM " + Metrics.ram.toFixed(0) + " %"
                        color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 9; font.bold: true
                    }

                    Rectangle { width: parent.width; height: 1; color: "#2a0c12" }

                    Text {
                        text: "VUMETRES AUDIO  -  CANAL L / R  (analyse PCM temps reel)"
                        color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 9; font.bold: true
                    }

                    // Les deux vumetres analogiques.
                    RowLayout {
                        width: parent.width
                        height: 212
                        spacing: 14
                        VuMeter {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            label: "L"
                            accent: win.cAccent
                            level: Player.vuLeft
                        }
                        VuMeter {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            label: "R"
                            accent: win.cCyan
                            level: Player.vuRight
                        }
                    }
                }
            }

            // ---------- LECTEUR AUDIO ----------
            Panel {
                x: 14
                width: col.width - 28
                title: "AUDIO PLAYER"
                accent: win.cAmber

                Column {
                    width: parent.width
                    spacing: 8

                    Item {
                        width: parent.width
                        height: 18
                        Text {
                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - 90
                            text: (Player.state === "playing" ? "LECTURE   "
                                   : Player.state === "paused" ? "PAUSE   "
                                   : "ARRET   ") + Player.currentTitle
                            color: win.cCyan
                            font.family: win.mono; font.pixelSize: 10; font.bold: true
                            elide: Text.ElideRight
                        }
                        Text {
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            text: Player.tracks.length + " PISTES"
                            color: win.cTextDim
                            font.family: win.mono; font.pixelSize: 9; font.bold: true
                        }
                    }

                    // Liste des pistes du dossier media/.
                    Rectangle {
                        width: parent.width
                        height: 150
                        radius: 4
                        color: "#06070a"
                        border.color: "#352026"
                        border.width: 1
                        ListView {
                            id: playlistView
                            anchors.fill: parent
                            anchors.margins: 4
                            clip: true
                            model: Player.tracks
                            delegate: Rectangle {
                                width: playlistView.width
                                height: 24
                                color: index === Player.index ? "#2a0b10"
                                       : (pma.containsMouse ? "#15181d"
                                          : "transparent")
                                Row {
                                    anchors.fill: parent
                                    anchors.leftMargin: 8
                                    spacing: 8
                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: 20
                                        text: index === Player.index
                                              ? "▶" : (index + 1)
                                        color: index === Player.index
                                               ? win.cAccent : "#5f6770"
                                        font.family: win.mono
                                        font.pixelSize: 9; font.bold: true
                                    }
                                    Text {
                                        anchors.verticalCenter: parent.verticalCenter
                                        width: playlistView.width - 44
                                        text: modelData
                                        color: index === Player.index
                                               ? "#ffffff" : "#aab0b7"
                                        font.family: win.mono; font.pixelSize: 9
                                        elide: Text.ElideRight
                                    }
                                }
                                MouseArea {
                                    id: pma
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: Player.play(index)
                                }
                            }
                            ScrollBar.vertical: ScrollBar { }
                        }
                        Text {
                            anchors.centerIn: parent
                            visible: Player.tracks.length === 0
                            text: "AUCUN FICHIER AUDIO DANS media/"
                            color: "#5f6770"
                            font.family: win.mono; font.pixelSize: 10; font.bold: true
                        }
                    }

                    // Transport.
                    Row {
                        width: parent.width
                        spacing: 8
                        NeonButton {
                            width: 104; height: 40
                            label: "|< PREV"
                            accent: win.cAmber
                            onClicked: Player.previous()
                        }
                        NeonButton {
                            width: 132; height: 40
                            label: Player.state === "playing" ? "|| PAUSE" : "> PLAY"
                            accent: win.cGreen
                            onClicked: Player.toggle()
                        }
                        NeonButton {
                            width: 104; height: 40
                            label: "[ ] STOP"
                            accent: "#9a2530"
                            onClicked: Player.stop()
                        }
                        NeonButton {
                            width: 104; height: 40
                            label: "NEXT >|"
                            accent: win.cAmber
                            onClicked: Player.next()
                        }
                        NeonButton {
                            width: 116; height: 40
                            label: "REFRESH"
                            accent: win.cCyan
                            onClicked: Player.scan()
                        }
                    }

                    // Barre de progression / navigation.
                    Item {
                        width: parent.width
                        height: 20
                        Rectangle {
                            id: seekBar
                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            width: parent.width - 140
                            height: 20
                            radius: 4
                            color: "#06070a"
                            border.color: "#341017"
                            border.width: 1
                            Rectangle {
                                x: 2
                                anchors.verticalCenter: parent.verticalCenter
                                height: parent.height - 4
                                width: Math.max(0, (seekBar.width - 4)
                                       * (Player.duration > 0
                                          ? Player.position / Player.duration : 0))
                                radius: 3
                                gradient: Gradient {
                                    orientation: Gradient.Horizontal
                                    GradientStop { position: 0.0; color: "#52000a" }
                                    GradientStop { position: 1.0; color: "#ff1e32" }
                                }
                                Behavior on width {
                                    NumberAnimation { duration: 150 }
                                }
                            }
                            MouseArea {
                                anchors.fill: parent
                                cursorShape: Qt.PointingHandCursor
                                onClicked: Player.seek(mouseX / width)
                            }
                        }
                        Text {
                            anchors.right: parent.right
                            anchors.verticalCenter: parent.verticalCenter
                            text: win.fmtTime(Player.position) + " / "
                                  + win.fmtTime(Player.duration)
                            color: win.cAmber
                            font.family: win.mono; font.pixelSize: 11; font.bold: true
                        }
                    }

                    Text {
                        width: parent.width
                        text: "DERNIER MEDIA : "
                              + (win.lastMedia.length > 0 ? win.lastMedia : "-")
                        color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 9
                        elide: Text.ElideRight
                    }
                }
            }

            // ---------- JOURNAL ----------
            Panel {
                x: 14
                width: col.width - 28
                title: "SYSTEM LOG"
                accent: win.cAccentSoft

                Column {
                    width: parent.width
                    spacing: 8

                    Rectangle {
                        width: parent.width
                        height: 156
                        radius: 4
                        color: "#06070a"
                        border.color: "#352026"
                        border.width: 1
                        ListView {
                            id: logView
                            anchors.fill: parent
                            anchors.margins: 6
                            clip: true
                            model: logModel
                            delegate: Text {
                                width: logView.width
                                text: model.line
                                color: model.line.indexOf("[ERREUR]") >= 0
                                       ? "#ff6b76"
                                       : model.line.indexOf("[OK]") >= 0
                                         ? "#7fe39a" : "#c2c7cd"
                                font.family: win.mono; font.pixelSize: 9
                                wrapMode: Text.WrapAnywhere
                            }
                            ScrollBar.vertical: ScrollBar { }
                        }
                    }

                    Item {
                        width: parent.width
                        height: 16
                        Text {
                            anchors.left: parent.left
                            text: "HISTORIQUE DES URL"
                            color: win.cAccentSoft
                            font.family: win.mono; font.pixelSize: 9; font.bold: true
                        }
                        Text {
                            anchors.right: parent.right
                            text: "EFFACER JOURNAL"
                            color: win.cTextDim
                            font.family: win.mono; font.pixelSize: 9; font.bold: true
                            MouseArea {
                                anchors.fill: parent
                                anchors.margins: -4
                                cursorShape: Qt.PointingHandCursor
                                onClicked: logModel.clear()
                            }
                        }
                    }

                    Rectangle {
                        width: parent.width
                        height: 96
                        radius: 4
                        color: "#06070a"
                        border.color: "#352026"
                        border.width: 1
                        ListView {
                            id: histView
                            anchors.fill: parent
                            anchors.margins: 4
                            clip: true
                            model: History.items
                            delegate: Rectangle {
                                width: histView.width
                                height: 22
                                color: hma.containsMouse ? "#15181d" : "transparent"
                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    anchors.left: parent.left
                                    anchors.leftMargin: 8
                                    width: parent.width - 16
                                    text: modelData
                                    color: "#9aa3ab"
                                    font.family: win.mono; font.pixelSize: 9
                                    elide: Text.ElideRight
                                }
                                MouseArea {
                                    id: hma
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: urlField.text = modelData
                                }
                            }
                            ScrollBar.vertical: ScrollBar { }
                        }
                    }
                }
            }
        }
    }
}
