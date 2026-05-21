// main.qml - fenetre principale de Kyronext-Studio.
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import Kyronext 1.0

ApplicationWindow {
    id: win
    visible: true
    width: 1200
    height: 1010
    minimumWidth: 980
    minimumHeight: 780
    title: "Kyronext-Studio"
    color: "#040506"

    // Pas de barre de titre systeme
    flags: Qt.FramelessWindowHint | Qt.Window

    readonly property color cAccent: "#ff2a3a"
    readonly property color cAccentSoft: "#ff5b69"
    readonly property color cCyan: "#35e6ff"
    readonly property color cAmber: "#ffc24b"
    readonly property color cGreen: "#54e36b"
    readonly property color cText: "#d8dde2"
    readonly property color cTextDim: "#7c858d"
    readonly property string mono: "DejaVu Sans Mono"

    Background {
        anchors.fill: parent
        energy: Player.bass
        lite: Config.liteMode
    }

    ListModel { id: logModel }
    function logAppend(line) {
        logModel.append({ "line": line });
        if (logModel.count > 100) logModel.remove(0);
        logView.positionViewAtEnd();
    }

    function fmtTime(seconds) {
        if (!seconds || seconds < 0 || isNaN(seconds)) return "0:00";
        var total = Math.floor(seconds);
        var m = Math.floor(total / 60);
        var s = total % 60;
        return m + ":" + (s < 10 ? "0" + s : s);
    }

    Connections {
        target: Downloader
        function onLogLine(line) { win.logAppend(line); }
        function onFinished(ok, message) {
            win.logAppend((ok ? "[OK] " : "[ERREUR] ") + message);
            Player.scan();
        }
    }

    // --- Barre de titre custom (drag + close) ---
    Rectangle {
        id: titleBar
        anchors { left: parent.left; right: parent.right; top: parent.top }
        height: 28
        color: "#0c0e12"
        border.color: "#1a1c22"
        border.width: 1
        z: 100

        // Zone draggable
        MouseArea {
            anchors.fill: parent
            anchors.rightMargin: 40
            onPressed: win.startSystemMove()
        }

        Text {
            anchors { left: parent.left; leftMargin: 12; verticalCenter: parent.verticalCenter }
            text: "KYRONEXT STUDIO"
            color: win.cAccent
            font.family: win.mono; font.pixelSize: 10; font.bold: true
            opacity: 0.8
        }

        // Bouton X
        Rectangle {
            anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
            width: 36
            color: closeMouse.containsMouse ? "#ff2a3a" : "transparent"
            Behavior on color { ColorAnimation { duration: 120 } }

            Text {
                anchors.centerIn: parent
                text: "×"
                color: closeMouse.containsMouse ? "#ffffff" : win.cTextDim
                font.pixelSize: 16
                font.bold: true
            }
            MouseArea {
                id: closeMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: Qt.quit()
            }
        }
    }

    // --- Equalizers Perimetriques ---
    BorderEqualizer {
        id: eqLeft
        anchors.left: parent.left; anchors.top: titleBar.bottom; anchors.bottom: parent.bottom
        anchors.topMargin: 0; anchors.bottomMargin: 0
        width: 14; orientation: "vertical"; value: Player.vuLeft; barCount: 40
    }
    BorderEqualizer {
        id: eqRight
        anchors.right: parent.right; anchors.top: titleBar.bottom; anchors.bottom: parent.bottom
        anchors.topMargin: 0; anchors.bottomMargin: 0
        width: 14; orientation: "vertical"; value: Player.vuRight; barCount: 40
    }

    // Top EQ (centre vers exterieur)
    Item {
        anchors.top: titleBar.bottom; anchors.left: parent.left; anchors.right: parent.right
        anchors.leftMargin: 20; anchors.rightMargin: 20
        height: 14
        BorderEqualizer {
            anchors.left: parent.left; anchors.right: parent.horizontalCenter
            height: 14; orientation: "horizontal"; value: Player.bass; barCount: 24
            colorStart: "#ff0000"; colorEnd: "#00ff00"
        }
        BorderEqualizer {
            anchors.right: parent.right; anchors.left: parent.horizontalCenter
            height: 14; orientation: "horizontal"; value: Player.bass; barCount: 24
        }
    }

    // Bottom EQ (centre vers exterieur)
    Item {
        anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right
        anchors.leftMargin: 20; anchors.rightMargin: 20
        height: 14
        BorderEqualizer {
            anchors.left: parent.left; anchors.right: parent.horizontalCenter
            height: 14; orientation: "horizontal"; value: Player.treble; barCount: 24
            colorStart: "#ff0000"; colorEnd: "#00ff00"
        }
        BorderEqualizer {
            anchors.right: parent.right; anchors.left: parent.horizontalCenter
            height: 14; orientation: "horizontal"; value: Player.treble; barCount: 24
        }
    }

    // --- Layout Principal ---
    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: 22   // apres EQ gauche (14) + air
        anchors.rightMargin: 22  // apres EQ droite (14) + air
        anchors.topMargin: 48    // barre titre (28) + EQ haut (14) + air
        anchors.bottomMargin: 22 // apres EQ bas (14) + air
        spacing: 3

        // EN-TETE
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 38
            RowLayout {
                id: headerRow
                anchors.fill: parent
                Column {
                    id: titleColumn
                    spacing: 0
                    Text {
                        text: "KYRONEXT STUDIO"; color: win.cAccent
                        font.family: win.mono; font.pixelSize: 20; font.bold: true
                    }
                    Text {
                        text: "KNIGHT INDUSTRIES MEDIA CENTER v2.0"; color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 8; font.bold: true
                    }
                }
                Item { Layout.fillWidth: true }
                Row {
                    id: buttonsRow
                    spacing: 10
                    ChipToggle { label: "UPDATE"; active: Config.autoUpdate; onToggled: Config.autoUpdate = !Config.autoUpdate }
                    ChipToggle { label: "LITE"; active: Config.liteMode; onToggled: Config.liteMode = !Config.liteMode }
                    Image {
                        source: "../assets/kitt.png"
                        fillMode: Image.PreserveAspectFit; height: 42
                        anchors.verticalCenter: parent.verticalCenter
                        opacity: 1.0
                    }
                }
            }
            // KITT au premier plan (au-dessus du RowLayout)
            Image {
                anchors.horizontalCenter: parent.horizontalCenter
                anchors.verticalCenter: parent.verticalCenter
                width: 340
                height: 38
                source: "../assets/kitt_nose.png"
                fillMode: Image.PreserveAspectCrop
                opacity: 0.85
            }
        }

        // SCANNER
        Rectangle {
            id: scanTrack
            Layout.fillWidth: true; Layout.preferredHeight: 2; radius: 1; color: "#0a0305"; clip: true
            Rectangle {
                width: 80; height: 2; x: -80
                gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0.5; color: win.cAccent } }
                PropertyAnimation on x { from: -80; to: scanTrack.width; duration: 1500; loops: Animation.Infinite }
            }
        }

        // YOUTUBE TARGET
        Panel {
            Layout.fillWidth: true; Layout.preferredHeight: 110; title: "YOUTUBE TARGET"; accent: win.cAccentSoft
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 4; spacing: 4
                RowLayout {
                    Layout.fillWidth: true; spacing: 6
                    TextField {
                        id: urlField; Layout.fillWidth: true; Layout.preferredHeight: 28
                        placeholderText: "PASTE YOUTUBE URL..."; color: "#fff"; font.pixelSize: 11
                        background: Rectangle { color: "#06070a"; border.color: "#3d1117" }
                    }
                    NeonButton { Layout.preferredWidth: 76; Layout.preferredHeight: 28; label: "PASTE"; accent: win.cCyan; onClicked: urlField.text = Shell.clipboard() }
                }
                RowLayout {
                    Layout.fillWidth: true; spacing: 8
                    ChipToggle { label: "VIDEO"; active: Config.mode === "video"; onToggled: Config.mode = "video" }
                    ChipToggle { label: "MP3"; active: Config.mode === "mp3"; onToggled: Config.mode = "mp3" }
                    ChipToggle { label: "PLAYLIST"; active: Config.playlist; onToggled: Config.playlist = !Config.playlist }
                    Item { Layout.fillWidth: true }
                    NeonButton {
                        id: dlButton; Layout.preferredWidth: 110; Layout.preferredHeight: 28
                        label: Downloader.busy ? "CANCEL" : "DOWNLOAD"; accent: Downloader.busy ? win.cAccent : win.cGreen
                        onClicked: Downloader.busy ? Downloader.cancel() : Downloader.start(urlField.text, Config.mode, Config.playlist)
                    }
                    NeonButton { Layout.preferredWidth: 80; Layout.preferredHeight: 28; label: "FILES"; accent: win.cCyan; onClicked: Shell.openMediaDir() }
                }
            }
        }

        // TRANSFER & CORE MONITOR
        RowLayout {
            Layout.fillWidth: true; Layout.preferredHeight: 290; spacing: 4
            Panel {
                Layout.preferredWidth: 240; Layout.fillHeight: true; title: "TRANSFER"; accent: win.cAccentSoft
                Column {
                    anchors.fill: parent; anchors.margins: 6; spacing: 6
                    Text { text: Downloader.status; color: win.cAccent; font.pixelSize: 10; font.bold: true }
                    Rectangle {
                        width: parent.width; height: 14; color: "#050608"
                        Rectangle { width: parent.width * (Downloader.percent / 100); height: parent.height; color: win.cAccent }
                    }
                    Grid {
                        columns: 2; spacing: 4; width: parent.width
                        Repeater {
                            model: [["SPEED", Downloader.speed], ["ETA", Downloader.eta]]
                            Column {
                                Text { text: modelData[0]; color: win.cTextDim; font.pixelSize: 8 }
                                Text { text: modelData[1]; color: "#fff"; font.pixelSize: 11; font.bold: true }
                            }
                        }
                    }
                    // KITT dans le fond du panel TRANSFER
                    Image {
                        anchors.horizontalCenter: parent.horizontalCenter
                        width: parent.width * 0.92
                        fillMode: Image.PreserveAspectFit
                        source: "../assets/kitt.png"
                        opacity: 0.45
                    }
                }
            }
            Panel {
                Layout.fillWidth: true; Layout.fillHeight: true; title: "CORE MONITOR"; accent: win.cCyan
                ColumnLayout {
                    anchors.fill: parent; spacing: 5

                    // Rangee 1 : jauges systeme.
                    RowLayout {
                        Layout.fillWidth: true; Layout.fillHeight: true; spacing: 4
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "CPU"; unit: "%"; value: Metrics.cpu; accent: win.cCyan }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "GPU"; unit: "%"; value: Metrics.gpu; accent: win.cGreen }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "RAM"; unit: "%"; value: Metrics.ram; accent: win.cAccentSoft }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "TEMP"; unit: "°C"; maxValue: 100; value: Metrics.temp; accent: win.cAmber }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "PWR"; unit: "W"; maxValue: 40; value: Metrics.power; accent: win.cAccent }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "↓"; unit: "Mo/s"; autoScale: true; value: Metrics.netDown; accent: win.cCyan }
                        Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "↑"; unit: "Mo/s"; autoScale: true; value: Metrics.netUp; accent: win.cGreen }
                    }

                    // Filet de separation.
                    Rectangle { Layout.fillWidth: true; Layout.preferredHeight: 1; color: "#241016" }

                    // Rangee 2 : banc de vumetres analogiques.
                    RowLayout {
                        Layout.fillWidth: true; Layout.preferredHeight: 105; spacing: 4
                        VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "L"; level: Player.vuLeft; accent: win.cAccent }
                        VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "R"; level: Player.vuRight; accent: win.cCyan }
                        VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "BASS"; level: Player.bass; accent: win.cAmber }
                        VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "MID"; level: Player.mid; accent: win.cGreen }
                        VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "TREBLE"; level: Player.treble; accent: win.cAccentSoft }
                    }
                }
            }
        }

        // AUDIO PLAYER
        Panel {
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumHeight: 380; title: "AUDIO PLAYER"; accent: win.cAmber
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 6; spacing: 4
                RowLayout {
                    Layout.fillWidth: true; Layout.fillHeight: true
                    Rectangle {
                        Layout.fillWidth: true; Layout.fillHeight: true; color: "#06070a"; border.color: "#352026"
                        Image {
                            anchors.fill: parent; anchors.margins: 8
                            fillMode: Image.PreserveAspectFit
                            source: "../assets/kitt.png"
                            opacity: 0.14
                        }
                        ListView {
                            id: playlistView
                            anchors.fill: parent; anchors.margins: 4; clip: true
                            model: Player.tracks; spacing: 1
                            delegate: Rectangle {
                                id: trackRow
                                width: playlistView.width; height: 22
                                readonly property bool current: index === Player.index
                                color: current ? "#2a0b10"
                                     : rowMouse.containsMouse ? "#17151b" : "transparent"
                                Behavior on color { ColorAnimation { duration: 120 } }
                                Rectangle {
                                    width: 2; height: parent.height
                                    color: trackRow.current ? win.cAmber : "transparent"
                                }
                                Text {
                                    anchors.verticalCenter: parent.verticalCenter
                                    x: 9; width: parent.width - 16
                                    text: modelData
                                    color: trackRow.current ? "#ffffff"
                                         : rowMouse.containsMouse ? "#c2c8ce" : "#8b929a"
                                    font.family: win.mono; font.pixelSize: 9
                                    elide: Text.ElideRight
                                }
                                MouseArea {
                                    id: rowMouse
                                    anchors.fill: parent; hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: Player.play(index)
                                }
                            }
                        }
                    }
                    Column {
                        Layout.preferredWidth: 212
                        Layout.fillHeight: true
                        spacing: 6

                        Text {
                            text: "NOW PLAYING"
                            color: win.cTextDim
                            font.family: win.mono; font.pixelSize: 8; font.bold: true
                        }
                        Text {
                            width: parent.width
                            text: Player.currentTitle
                            color: "#ffffff"
                            font.family: win.mono; font.pixelSize: 12; font.bold: true
                            elide: Text.ElideRight
                        }
                        Text {
                            text: fmtTime(Player.position) + "  /  " + fmtTime(Player.duration)
                            color: win.cAmber
                            font.family: win.mono; font.pixelSize: 10; font.bold: true
                        }
                        Item { width: 1; height: 2 }
                        Row {
                            spacing: 6
                            NeonButton { width: 44; height: 30; label: "<<"; accent: win.cAmber; onClicked: Player.previous() }
                            NeonButton { width: 52; height: 30; label: Player.state === "playing" ? "||" : ">"; accent: win.cGreen; onClicked: Player.toggle() }
                            NeonButton { width: 44; height: 30; label: ">>"; accent: win.cAmber; onClicked: Player.next() }
                        }
                        Item { width: 1; height: 2 }
                        VolumeControl { width: parent.width; accent: win.cAmber }
                    }
                }

                // --- TONE + SCOPE + TAPE + SPECTRE + SCOPE ---
                RowLayout {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 140
                    spacing: 4
                    ToneControls {
                        Layout.preferredWidth: 120
                        Layout.fillHeight: true
                        // Valeurs fixes — pas de rotation automatique avec l'audio
                        bassValue: 0.5
                        midValue: 0.5
                        trebleValue: 0.5
                    }
                    Oscilloscope {
                        Layout.preferredWidth: 140
                        Layout.fillHeight: true
                        vuLeft: Player.vuLeft
                        vuRight: Player.vuRight
                        bass: Player.bass
                        mid: Player.mid
                    }
                    TapeDeck {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        vuLeft: Player.vuLeft
                        vuRight: Player.vuRight
                        bass: Player.bass
                        state: Player.state
                        title: Player.currentTitle
                        position: Player.position
                    }
                    SpectreAnalyzer {
                        Layout.preferredWidth: 200
                        Layout.fillHeight: true
                        vuLeft: Player.vuLeft
                        vuRight: Player.vuRight
                        bass: Player.bass
                        mid: Player.mid
                        treble: Player.treble
                    }
                    Oscilloscope {
                        Layout.preferredWidth: 200
                        Layout.fillHeight: true
                        vuLeft: Player.vuLeft
                        vuRight: Player.vuRight
                        bass: Player.bass
                        mid: Player.mid
                    }
                }

                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 7
                    radius: 3.5
                    color: "#141318"
                    border.color: "#2c2a33"; border.width: 1
                    Rectangle {
                        x: 1; y: 1
                        width: Math.max(0, (parent.width - 2) * (Player.duration > 0 ? Player.position / Player.duration : 0))
                        height: parent.height - 2
                        radius: 2.5
                        gradient: Gradient {
                            orientation: Gradient.Horizontal
                            GradientStop { position: 0.0; color: Qt.darker(win.cAmber, 1.7) }
                            GradientStop { position: 1.0; color: win.cAmber }
                        }
                    }
                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: Player.seek(mouse.x / width)
                    }
                }
            }
        }

        // SYSTEM LOG & HISTORY
        RowLayout {
            Layout.fillWidth: true; Layout.preferredHeight: 100; spacing: 4
            Panel {
                Layout.fillWidth: true; Layout.fillHeight: true; title: "SYSTEM LOG"; accent: win.cAccentSoft
                ListView {
                    id: logView; anchors.fill: parent; anchors.margins: 4; model: logModel; clip: true
                    delegate: Text { text: "> " + model.line; color: "#5c6c7c"; font.pixelSize: 8; width: logView.width; wrapMode: Text.Wrap }
                }
            }
            Panel {
                Layout.preferredWidth: 280; Layout.fillHeight: true; title: "HISTORY"; accent: win.cCyan
                ListView {
                    id: histView; anchors.fill: parent; anchors.margins: 4; model: History.items; clip: true
                    delegate: Rectangle {
                        width: histView.width; height: 16; color: "transparent"
                        Text { anchors.fill: parent; text: modelData; color: "#888"; font.pixelSize: 8; elide: Text.ElideRight }
                        MouseArea { anchors.fill: parent; onClicked: urlField.text = modelData }
                    }
                }
            }
        }
    }
}
