// main.qml - fenetre principale de Kyronext-Studio.
import QtQuick 2.15
import QtQuick.Controls 2.15
import QtQuick.Layouts 1.15
import Kyronext 1.0

ApplicationWindow {
    id: win
    visible: true
    width: 1200
    height: 800
    minimumWidth: 980
    minimumHeight: 600
    title: "Kyronext-Studio"
    color: "#040506"

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

    Connections {
        target: Downloader
        function onLogLine(line) { win.logAppend(line); }
        function onFinished(ok, message) {
            win.logAppend((ok ? "[OK] " : "[ERREUR] ") + message);
            Player.scan();
        }
    }

    // --- Equalizers Perimetriques ---
    BorderEqualizer {
        id: eqLeft
        anchors.left: parent.left; anchors.top: parent.top; anchors.bottom: parent.bottom
        width: 15; orientation: "vertical"; value: Player.vuLeft; barCount: 40
    }
    BorderEqualizer {
        id: eqRight
        anchors.right: parent.right; anchors.top: parent.top; anchors.bottom: parent.bottom
        width: 15; orientation: "vertical"; value: Player.vuRight; barCount: 40
    }
    
    // Top EQ (centre vers exterieur)
    Item {
        anchors.top: parent.top; anchors.left: parent.left; anchors.right: parent.right
        anchors.leftMargin: 20; anchors.rightMargin: 20
        height: 15
        BorderEqualizer {
            anchors.left: parent.left; anchors.right: parent.horizontalCenter
            height: 15; orientation: "horizontal"; value: Player.bass; barCount: 20
            colorStart: "#ff0000"; colorEnd: "#00ff00" // Inverse pour aller du centre
        }
        BorderEqualizer {
            anchors.right: parent.right; anchors.left: parent.horizontalCenter
            height: 15; orientation: "horizontal"; value: Player.bass; barCount: 20
        }
    }

    // Bottom EQ (centre vers exterieur)
    Item {
        anchors.bottom: parent.bottom; anchors.left: parent.left; anchors.right: parent.right
        anchors.leftMargin: 20; anchors.rightMargin: 20
        height: 15
        BorderEqualizer {
            anchors.left: parent.left; anchors.right: parent.horizontalCenter
            height: 15; orientation: "horizontal"; value: Player.treble; barCount: 20
            colorStart: "#ff0000"; colorEnd: "#00ff00"
        }
        BorderEqualizer {
            anchors.right: parent.right; anchors.left: parent.horizontalCenter
            height: 15; orientation: "horizontal"; value: Player.treble; barCount: 20
        }
    }

    // --- Layout Principal (Compact & Responsive) ---
    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 25
        spacing: 4

        // EN-TETE
        Item {
            Layout.fillWidth: true
            Layout.preferredHeight: 45
            RowLayout {
                anchors.fill: parent
                Column {
                    spacing: 0
                    Text {
                        text: "KYRONEXT STUDIO"; color: win.cAccent
                        font.family: win.mono; font.pixelSize: 22; font.bold: true
                    }
                    Text {
                        text: "KNIGHT INDUSTRIES MEDIA CENTER v2.0"; color: win.cTextDim
                        font.family: win.mono; font.pixelSize: 9; font.bold: true
                    }
                }
                Item { Layout.fillWidth: true }
                Row {
                    spacing: 10
                    ChipToggle { label: "UPDATE"; active: Config.autoUpdate; onToggled: Config.autoUpdate = !Config.autoUpdate }
                    ChipToggle { label: "LITE"; active: Config.liteMode; onToggled: Config.liteMode = !Config.liteMode }
                    Image {
                        source: Shell.phoenixSource; visible: Shell.phoenixSource !== ""
                        fillMode: Image.PreserveAspectFit; height: 40; opacity: 0.8
                    }
                }
            }
        }

        // SCANNER
        Rectangle {
            Layout.fillWidth: true; Layout.preferredHeight: 3; radius: 1.5; color: "#0a0305"; clip: true
            Rectangle {
                width: 100; height: 3; x: -100
                gradient: Gradient { orientation: Gradient.Horizontal; GradientStop { position: 0.5; color: win.cAccent } }
                PropertyAnimation on x { from: -100; to: parent.width; duration: 1500; loops: Animation.Infinite }
            }
        }

        // YOUTUBE TARGET
        Panel {
            Layout.fillWidth: true; Layout.preferredHeight: 75; title: "YOUTUBE TARGET"; accent: win.cAccentSoft
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 4; spacing: 4
                RowLayout {
                    spacing: 6
                    TextField {
                        id: urlField; Layout.fillWidth: true; height: 30
                        placeholderText: "PASTE YOUTUBE URL..."; color: "#fff"; font.pixelSize: 11
                        background: Rectangle { color: "#06070a"; border.color: "#3d1117" }
                    }
                    NeonButton { width: 80; height: 30; label: "PASTE"; accent: win.cCyan; onClicked: urlField.text = Shell.clipboard() }
                }
                RowLayout {
                    spacing: 8
                    ChipToggle { label: "VIDEO"; active: Config.mode === "video"; onToggled: Config.mode = "video" }
                    ChipToggle { label: "MP3"; active: Config.mode === "mp3"; onToggled: Config.mode = "mp3" }
                    ChipToggle { label: "PLAYLIST"; active: Config.playlist; onToggled: Config.playlist = !Config.playlist }
                    Item { Layout.fillWidth: true }
                    NeonButton {
                        id: dlButton; width: 120; height: 30
                        label: Downloader.busy ? "CANCEL" : "DOWNLOAD"; accent: Downloader.busy ? win.cAccent : win.cGreen
                        onClicked: Downloader.busy ? Downloader.cancel() : Downloader.start(urlField.text, Config.mode, Config.playlist)
                    }
                    NeonButton { width: 90; height: 30; label: "FILES"; accent: win.cCyan; onClicked: Shell.openMediaDir() }
                }
            }
        }

        // TRANSFER & CORE MONITOR
        RowLayout {
            Layout.fillWidth: true; Layout.preferredHeight: 140; spacing: 4
            Panel {
                Layout.preferredWidth: 300; Layout.fillHeight: true; title: "TRANSFER"; accent: win.cAccentSoft
                Column {
                    anchors.fill: parent; anchors.margins: 6; spacing: 6
                    Text { text: Downloader.status; color: win.cAccent; font.pixelSize: 10; font.bold: true }
                    Rectangle {
                        width: parent.width; height: 16; color: "#050608"
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
                }
            }
            Panel {
                Layout.fillWidth: true; Layout.fillHeight: true; title: "CORE MONITOR"; accent: win.cCyan
                RowLayout {
                    anchors.fill: parent; anchors.margins: 4; spacing: 4
                    Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "UPLOAD"; unit: "Mo/s"; value: Metrics.netUp; accent: win.cCyan }
                    Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "DOWNLOAD"; unit: "Mo/s"; value: Metrics.netDown; accent: win.cAccent }
                    VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "L"; level: Player.vuLeft }
                    VuMeter { Layout.fillWidth: true; Layout.fillHeight: true; label: "R"; level: Player.vuRight }
                    Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "PWR"; unit: "W"; value: Metrics.power; accent: win.cAmber }
                    Gauge { Layout.fillWidth: true; Layout.fillHeight: true; label: "GPU"; unit: "%"; value: Metrics.gpu; accent: win.cGreen }
                }
            }
        }

        // AUDIO PLAYER
        Panel {
            Layout.fillWidth: true; Layout.fillHeight: true; Layout.minimumHeight: 180; title: "AUDIO PLAYER"; accent: win.cAmber
            ColumnLayout {
                anchors.fill: parent; anchors.margins: 6; spacing: 4
                RowLayout {
                    Layout.fillWidth: true; Layout.fillHeight: true
                    Rectangle {
                        Layout.fillWidth: true; Layout.fillHeight: true; color: "#06070a"; border.color: "#352026"
                        ListView {
                            id: playlistView; anchors.fill: parent; anchors.margins: 4; clip: true; model: Player.tracks
                            delegate: Rectangle {
                                width: playlistView.width; height: 20; color: index === Player.index ? "#2a0b10" : "transparent"
                                Text { anchors.centerIn: parent; text: modelData; color: index === Player.index ? "#fff" : "#888"; font.pixelSize: 9; elide: Text.ElideRight; width: parent.width-10 }
                                MouseArea { anchors.fill: parent; onClicked: Player.play(index) }
                            }
                        }
                    }
                    Column {
                        Layout.preferredWidth: 200; spacing: 4
                        Text { text: Player.currentTitle; color: "#fff"; font.pixelSize: 11; font.bold: true; width: 200; elide: Text.ElideRight }
                        Text { text: fmtTime(Player.position) + " / " + fmtTime(Player.duration); color: win.cAmber; font.pixelSize: 10 }
                        Row {
                            spacing: 4
                            NeonButton { width: 45; height: 30; label: "<<"; accent: win.cAmber; onClicked: Player.previous() }
                            NeonButton { width: 55; height: 30; label: Player.state === "playing" ? "||" : ">"; accent: win.cGreen; onClicked: Player.toggle() }
                            NeonButton { width: 45; height: 30; label: ">>"; accent: win.cAmber; onClicked: Player.next() }
                        }
                    }
                }
                Rectangle {
                    Layout.fillWidth: true; Layout.preferredHeight: 6; color: "#111"
                    Rectangle { width: parent.width * (Player.duration > 0 ? Player.position / Player.duration : 0); height: parent.height; color: win.cAmber }
                    MouseArea { anchors.fill: parent; onClicked: Player.seek(mouse.x / width) }
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
                    delegate: Text { text: "> " + model.line; color: "#5c6c7c"; font.pixelSize: 8; width: parent.width; wrapMode: Text.Wrap }
                }
            }
            Panel {
                Layout.preferredWidth: 300; Layout.fillHeight: true; title: "HISTORY"; accent: win.cCyan
                ListView {
                    id: histView; anchors.fill: parent; anchors.margins: 4; model: History.items; clip: true
                    delegate: Rectangle {
                        width: parent.width; height: 16; color: "transparent"
                        Text { anchors.fill: parent; text: modelData; color: "#888"; font.pixelSize: 8; elide: Text.ElideRight }
                        MouseArea { anchors.fill: parent; onClicked: urlField.text = modelData }
                    }
                }
            }
        }
    }
}
