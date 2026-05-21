// VolumeControl.qml - reglage du volume de lecture.
//
// Icone haut-parleur cliquable (bascule la sourdine) + glissiere fine et
// lecture du pourcentage. Style sobre, accorde au tableau de bord.
import QtQuick 2.15
import Kyronext 1.0

Item {
    id: root

    property color accent: "#ffc24b"
    implicitWidth: 210
    implicitHeight: 28

    readonly property bool muted: Player.muted
    readonly property real vol: Player.volume
    readonly property color liveColor: muted ? "#6b7079" : accent

    // --- icone haut-parleur ------------------------------------------------
    Item {
        id: speaker
        width: 26
        anchors { left: parent.left; top: parent.top; bottom: parent.bottom }

        Canvas {
            id: icon
            anchors.fill: parent
            // Repeint des que l'etat audible change (volume ou sourdine).
            property real lvl: root.muted ? -1 : root.vol
            onLvlChanged: requestPaint()
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onPaint: {
                var ctx = getContext("2d");
                ctx.reset();
                var cy = height / 2;
                var col = root.muted ? "#6b7079" : root.accent;
                ctx.fillStyle = col;
                ctx.strokeStyle = col;
                ctx.lineWidth = 1.7;
                ctx.lineCap = "round";
                ctx.lineJoin = "round";

                // Corps + cone du haut-parleur.
                ctx.beginPath();
                ctx.moveTo(3, cy - 3.5);
                ctx.lineTo(7.5, cy - 3.5);
                ctx.lineTo(12.5, cy - 7.5);
                ctx.lineTo(12.5, cy + 7.5);
                ctx.lineTo(7.5, cy + 3.5);
                ctx.lineTo(3, cy + 3.5);
                ctx.closePath();
                ctx.fill();

                if (root.muted) {
                    // Croix de sourdine.
                    var mx = 19.5;
                    ctx.lineWidth = 1.9;
                    ctx.beginPath();
                    ctx.moveTo(mx - 3.2, cy - 3.2);
                    ctx.lineTo(mx + 3.2, cy + 3.2);
                    ctx.moveTo(mx + 3.2, cy - 3.2);
                    ctx.lineTo(mx - 3.2, cy + 3.2);
                    ctx.stroke();
                } else {
                    // Ondes sonores : leur nombre traduit le niveau.
                    var waves = root.vol > 0.66 ? 3
                              : root.vol > 0.33 ? 2
                              : root.vol > 0.02 ? 1 : 0;
                    for (var i = 0; i < waves; i++) {
                        ctx.beginPath();
                        ctx.arc(13, cy, 3.4 + i * 3.3, -0.9, 0.9, false);
                        ctx.stroke();
                    }
                }
            }
        }
        MouseArea {
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: Player.toggleMute()
        }
    }

    // --- pourcentage -------------------------------------------------------
    Text {
        id: pct
        anchors { right: parent.right; verticalCenter: parent.verticalCenter }
        width: 34
        horizontalAlignment: Text.AlignRight
        text: root.muted ? "MUET" : Math.round(root.vol * 100) + "%"
        color: root.liveColor
        font.family: "DejaVu Sans Mono"
        font.pixelSize: 9
        font.bold: true
    }

    // --- glissiere ---------------------------------------------------------
    Item {
        id: bar
        anchors {
            left: speaker.right; leftMargin: 2
            right: pct.left; rightMargin: 9
            verticalCenter: parent.verticalCenter
        }
        height: parent.height

        readonly property real grip: 13
        readonly property real span: Math.max(1, width - grip)
        readonly property real frac: root.muted ? 0.0 : root.vol

        // Piste.
        Rectangle {
            anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
            height: 4; radius: 2
            color: "#141318"
            border.color: "#2c2a33"; border.width: 1
        }
        // Remplissage.
        Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            x: bar.grip / 2
            width: bar.span * bar.frac
            height: 4; radius: 2
            visible: !root.muted && width > 0.5
            gradient: Gradient {
                orientation: Gradient.Horizontal
                GradientStop { position: 0.0; color: Qt.darker(root.accent, 1.7) }
                GradientStop { position: 1.0; color: root.accent }
            }
            Behavior on width {
                enabled: !handleMouse.pressed
                NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
            }
        }
        // Poignee.
        Rectangle {
            id: handle
            width: bar.grip; height: bar.grip; radius: bar.grip / 2
            anchors.verticalCenter: parent.verticalCenter
            x: bar.span * bar.frac
            color: root.muted ? "#23232a" : "#f2f4f6"
            border.width: 2
            border.color: root.liveColor
            Behavior on x {
                enabled: !handleMouse.pressed
                NumberAnimation { duration: 100; easing.type: Easing.OutCubic }
            }
            Behavior on color { ColorAnimation { duration: 150 } }

            // Halo discret au survol / pendant le glisser.
            Rectangle {
                anchors.centerIn: parent
                width: parent.width + 9; height: width; radius: width / 2
                color: "transparent"
                border.color: root.accent; border.width: 2
                opacity: (handleMouse.containsMouse || handleMouse.pressed) && !root.muted ? 0.45 : 0.0
                Behavior on opacity { NumberAnimation { duration: 150 } }
            }
        }
        MouseArea {
            id: handleMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            function apply(px) {
                Player.setVolume((px - bar.grip / 2) / bar.span);
            }
            onPressed: apply(mouse.x)
            onPositionChanged: if (pressed) apply(mouse.x)
        }
    }
}
