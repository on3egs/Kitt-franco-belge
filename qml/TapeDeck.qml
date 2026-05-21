// TapeDeck.qml - deck cassette premium avec porte frontale mecanique.
//
// Porte vitree ouvrante, interieur compartiment visible, guides mecaniques,
// cassette TDK detaillee avec reliefs plastiques, vis, bande magnetique,
// tete de lecture avec ombres internes, eclairage chaud analogique.
import QtQuick 2.15

Item {
    id: root

    property real vuLeft: 0.0
    property real vuRight: 0.0
    property real bass: 0.0
    property string state: "stopped"
    property string title: "NO TAPE"
    property real position: 0.0

    property color chrome: "#8a8f96"
    property color ledGreen: "#3aaa50"
    property color ledRed: "#cc2020"
    property color ledAmber: "#cc8820"

    implicitHeight: 130

    property real reelAngle: 0.0
    Timer { interval: 16; running: root.state === "playing"; repeat: true; onTriggered: root.reelAngle += 2.4 }

    // === CHASSIS METAL ===
    Rectangle {
        anchors.fill: parent; radius: 8
        color: "#08090c"; border.color: "#1a1c22"; border.width: 1
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0f1116" }
            GradientStop { position: 0.5; color: "#08090c" }
            GradientStop { position: 1.0; color: "#040508" }
        }
        // Bord chrome haut
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 1; color: root.chrome; opacity: 0.12
        }
        // Biseaute interieur
        Rectangle {
            anchors.fill: parent; anchors.margins: 1; radius: 7
            color: "transparent"; border.color: "#050608"; border.width: 1
        }
    }

    // === VIS (4 coins chassis) ===
    Repeater {
        model: [{x: 6, y: 6}, {x: parent.width - 14, y: 6}, {x: 6, y: parent.height - 14}, {x: parent.width - 14, y: parent.height - 14}]
        Rectangle {
            x: modelData.x; y: modelData.y
            width: 8; height: 8; radius: 4
            color: "#0c0d10"; border.color: root.chrome; border.width: 0.6; opacity: 0.25
            Canvas {
                anchors.fill: parent
                onPaint: {
                    var ctx = getContext("2d"); ctx.reset();
                    ctx.strokeStyle = "#2a2e35"; ctx.lineWidth = 0.6;
                    ctx.beginPath(); ctx.moveTo(2.5, 2.5); ctx.lineTo(5.5, 5.5); ctx.moveTo(5.5, 2.5); ctx.lineTo(2.5, 5.5); ctx.stroke();
                }
            }
        }
    }

    // === PORTE FRONTALE VITREE ===
    Rectangle {
        anchors { horizontalCenter: parent.horizontalCenter; top: parent.top; topMargin: 8 }
        width: 200; height: 62; radius: 3
        color: "#050608"
        border.color: "#1e2028"; border.width: 1.5

        // Encadrement plastique epais
        Rectangle {
            anchors.fill: parent; anchors.margins: 2; radius: 2
            color: "transparent"; border.color: "#121418"; border.width: 1
        }
        // Reflet bord vitre
        Rectangle {
            anchors { left: parent.left; right: parent.right; top: parent.top }
            height: 2; color: Qt.rgba(1,1,1,0.04)
        }

        // === INTERIEUR COMPARTIMENT ===
        Rectangle {
            anchors.fill: parent; anchors.margins: 5; radius: 1
            color: "#030405"; border.color: "#0c0e12"; border.width: 1

            // === GUIDES MECANIQUES (gauche / droite) ===
            Rectangle {
                anchors { left: parent.left; top: parent.top; bottom: parent.bottom }
                width: 6; color: "#0a0b0d"; border.color: "#121418"; border.width: 0.5
                // Rainures
                Repeater {
                    model: 3
                    Rectangle {
                        anchors { left: parent.left; right: parent.right }
                        anchors.leftMargin: 1; anchors.rightMargin: 1
                        y: 4 + index * 14; height: 1; color: "#08090a"
                    }
                }
            }
            Rectangle {
                anchors { right: parent.right; top: parent.top; bottom: parent.bottom }
                width: 6; color: "#0a0b0d"; border.color: "#121418"; border.width: 0.5
                Repeater {
                    model: 3
                    Rectangle {
                        anchors { left: parent.left; right: parent.right }
                        anchors.leftMargin: 1; anchors.rightMargin: 1
                        y: 4 + index * 14; height: 1; color: "#08090a"
                    }
                }
            }

            // === AXES BOBINES FIXES ===
            Rectangle {
                anchors { left: parent.left; leftMargin: 18; verticalCenter: parent.verticalCenter }
                width: 8; height: 8; radius: 4
                color: "#0c0d10"; border.color: "#1a1c22"; border.width: 0.8
            }
            Rectangle {
                anchors { right: parent.right; rightMargin: 18; verticalCenter: parent.verticalCenter }
                width: 8; height: 8; radius: 4
                color: "#0c0d10"; border.color: "#1a1c22"; border.width: 0.8
            }

            // === ROULEAUX (guides bande) ===
            Rectangle {
                anchors { left: parent.left; leftMargin: 44; verticalCenter: parent.verticalCenter }
                width: 6; height: 6; radius: 3
                color: "#101214"; border.color: "#1a1c22"; border.width: 0.5
            }
            Rectangle {
                anchors { right: parent.right; rightMargin: 44; verticalCenter: parent.verticalCenter }
                width: 6; height: 6; radius: 3
                color: "#101214"; border.color: "#1a1c22"; border.width: 0.5
            }

            // === TETE DE LECTURE (capstan central) ===
            Rectangle {
                anchors.centerIn: parent
                width: 14; height: 28
                color: "#08090c"; border.color: "#1a1c22"; border.width: 1; radius: 2
                // Fente
                Rectangle {
                    anchors { top: parent.top; bottom: parent.bottom; horizontalCenter: parent.horizontalCenter }
                    width: 2; color: "#040506"
                }
                // Capstan
                Rectangle {
                    anchors { horizontalCenter: parent.horizontalCenter; verticalCenter: parent.verticalCenter }
                    width: 3; height: 10; radius: 1.5
                    color: "#1a1c22"; border.color: "#2a2e35"; border.width: 0.5
                }
                // LED REC
                Rectangle {
                    anchors { top: parent.top; horizontalCenter: parent.horizontalCenter; topMargin: 3 }
                    width: 6; height: 3; radius: 1
                    color: root.state === "playing" ? root.ledRed : "#120808"
                    opacity: root.state === "playing" ? 0.85 : 0.2
                    Behavior on opacity { NumberAnimation { duration: 200 } }
                }
            }

            // === OMBRE INTERNE (profondeur) ===
            Rectangle {
                anchors.fill: parent
                gradient: Gradient {
                    GradientStop { position: 0.0; color: Qt.rgba(0,0,0,0.3) }
                    GradientStop { position: 0.4; color: "transparent" }
                    GradientStop { position: 1.0; color: Qt.rgba(0,0,0,0.5) }
                }
            }

            // === CASSETTE TDK ===
            Item {
                anchors.centerIn: parent
                width: 146; height: 42

                // Boitier plastique
                Canvas {
                    anchors.fill: parent
                    onPaint: {
                        var ctx = getContext("2d"); ctx.reset();
                        var w = width, h = height;
                        var notchW = 14; var notchH = 12;

                        ctx.beginPath();
                        ctx.moveTo(notchW, 0);
                        ctx.lineTo(w - notchW, 0);
                        ctx.lineTo(w - notchW, (h - notchH) / 2 - 1);
                        ctx.lineTo(w, (h - notchH) / 2 - 1);
                        ctx.lineTo(w, (h + notchH) / 2 + 1);
                        ctx.lineTo(w - notchW, (h + notchH) / 2 + 1);
                        ctx.lineTo(w - notchW, h);
                        ctx.lineTo(notchW, h);
                        ctx.lineTo(notchW, (h + notchH) / 2 + 1);
                        ctx.lineTo(0, (h + notchH) / 2 + 1);
                        ctx.lineTo(0, (h - notchH) / 2 - 1);
                        ctx.lineTo(notchW, (h - notchH) / 2 - 1);
                        ctx.closePath();

                        // Remplissage noir plastique
                        ctx.fillStyle = "#0a0b0d";
                        ctx.fill();

                        // Bordure plastique
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = "#1e2026";
                        ctx.stroke();

                        // Etiquette TDK (bande orange)
                        ctx.fillStyle = "#2a2010";
                        ctx.fillRect(notchW, 0, w - notchW * 2, 8);
                        ctx.fillStyle = "#c8a030";
                        ctx.font = "bold 5px 'DejaVu Sans Mono'";
                        ctx.textAlign = "left"; ctx.textBaseline = "middle";
                        ctx.fillText("TDK", notchW + 3, 4);
                        ctx.fillStyle = "#5a5040";
                        ctx.font = "5px 'DejaVu Sans Mono'";
                        ctx.textAlign = "right";
                        ctx.fillText("SA-X 90", w - notchW - 3, 4);
                        ctx.textAlign = "left";
                        ctx.fillStyle = "#3a3020";
                        ctx.fillText("TYPE IV", notchW + 24, 4);

                        // Trou central
                        ctx.fillStyle = "#030405";
                        ctx.beginPath(); ctx.arc(w / 2, h - 3, 2.5, 0, Math.PI * 2); ctx.fill();

                        // Ecriture B-Manix
                        ctx.fillStyle = "#6a5a30";
                        ctx.font = "bold 4px 'DejaVu Sans Mono'";
                        ctx.textAlign = "center";
                        ctx.fillText("B-Manix", w / 2, h - 8);

                        // A/B sides
                        ctx.fillStyle = "#2a3038";
                        ctx.font = "4px 'DejaVu Sans Mono'";
                        ctx.fillText("A", 10, h / 2 + 2);
                        ctx.fillText("B", w - 10, h / 2 + 2);

                        // Trous bobines
                        ctx.fillStyle = "#030405";
                        ctx.strokeStyle = "#1a1c22"; ctx.lineWidth = 0.5;
                        for (var side = 0; side < 2; side++) {
                            var cx = side === 0 ? 22 : w - 22;
                            for (var i = 0; i < 6; i++) {
                                var a = i * Math.PI / 3;
                                var tx = cx + Math.cos(a) * 8;
                                var ty = h / 2 + Math.sin(a) * 8;
                                ctx.beginPath(); ctx.arc(tx, ty, 2, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                            }
                        }
                    }
                }

                // === BOBINE GAUCHE ===
                Item {
                    width: 30; height: 30
                    anchors { left: parent.left; leftMargin: 8; verticalCenter: parent.verticalCenter }
                    Rectangle {
                        anchors.fill: parent; radius: width / 2
                        color: "#14161a"; border.color: "#2a2e35"; border.width: 1
                        gradient: Gradient {
                            GradientStop { position: 0.0; color: "#2a2e35" }
                            GradientStop { position: 0.5; color: "#14161a" }
                            GradientStop { position: 1.0; color: "#0a0b0d" }
                        }
                        Item {
                            anchors.fill: parent; anchors.margins: 3
                            rotation: root.reelAngle
                            Repeater {
                                model: 6
                                Rectangle {
                                    width: 2; height: parent.height * 0.38; radius: 1
                                    color: "#3a3e45"; anchors.centerIn: parent
                                    transform: Rotation { origin.x: width/2; origin.y: height/2; angle: index * 60 }
                                }
                            }
                        }
                        Rectangle {
                            anchors.centerIn: parent
                            width: 6; height: 6; radius: 3
                            color: "#08090b"; border.color: "#3a3e45"; border.width: 0.6
                        }
                    }
                    Rectangle {
                        anchors.centerIn: parent
                        width: parent.width + 6; height: width; radius: width/2
                        color: "transparent"; border.color: root.ledAmber; border.width: 1
                        opacity: root.state === "playing" ? 0.08 + root.bass * 0.12 : 0.0
                    }
                }

                // === BOBINE DROITE ===
                Item {
                    width: 30; height: 30
                    anchors { right: parent.right; rightMargin: 8; verticalCenter: parent.verticalCenter }
                    Rectangle {
                        anchors.fill: parent; radius: width / 2
                        color: "#14161a"; border.color: "#2a2e35"; border.width: 1
                        gradient: Gradient {
                            GradientStop { position: 0.0; color: "#2a2e35" }
                            GradientStop { position: 0.5; color: "#14161a" }
                            GradientStop { position: 1.0; color: "#0a0b0d" }
                        }
                        Item {
                            anchors.fill: parent; anchors.margins: 3
                            rotation: root.reelAngle
                            Repeater {
                                model: 6
                                Rectangle {
                                    width: 2; height: parent.height * 0.38; radius: 1
                                    color: "#3a3e45"; anchors.centerIn: parent
                                    transform: Rotation { origin.x: width/2; origin.y: height/2; angle: index * 60 }
                                }
                            }
                        }
                        Rectangle {
                            anchors.centerIn: parent
                            width: 6; height: 6; radius: 3
                            color: "#08090b"; border.color: "#3a3e45"; border.width: 0.6
                        }
                    }
                    Rectangle {
                        anchors.centerIn: parent
                        width: parent.width + 6; height: width; radius: width/2
                        color: "transparent"; border.color: root.ledAmber; border.width: 1
                        opacity: root.state === "playing" ? 0.08 + root.bass * 0.12 : 0.0
                    }
                }

                // === BANDE MAGNETIQUE ===
                Rectangle {
                    anchors { left: parent.left; right: parent.right; verticalCenter: parent.verticalCenter }
                    anchors.leftMargin: 40; anchors.rightMargin: 40
                    height: 7; color: "#050608"; border.color: "#0f1012"; border.width: 1; radius: 1
                    Canvas {
                        anchors.fill: parent; opacity: 0.35
                        property real tapeOff: 0.0
                        Timer { interval: 40; running: root.state === "playing"; repeat: true; onTriggered: parent.tapeOff -= 1.2 }
                        onTapeOffChanged: requestPaint()
                        onPaint: {
                            var ctx = getContext("2d"); ctx.reset(); ctx.lineWidth = 0.5;
                            var off = tapeOff % 4;
                            for (var x = off; x < width; x += 4) {
                                ctx.strokeStyle = "#1a1808";
                                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
                            }
                        }
                    }
                }
            }
        }

        // === VITRE REFLETS (tres subtils) ===
        Rectangle {
            anchors.fill: parent
            radius: parent.radius
            color: "transparent"
            Rectangle {
                anchors { left: parent.left; right: parent.right; top: parent.top }
                height: parent.radius
                radius: parent.radius
                color: "transparent"
                border.color: Qt.rgba(1,1,1,0.02); border.width: 1
            }
        }
    }

    // === COMPTEUR + VU + INDICATEURS ===
    Row {
        anchors { horizontalCenter: parent.horizontalCenter; bottom: parent.bottom; bottomMargin: 8 }
        spacing: 10

        // Compteur 7 segments
        Row {
            spacing: 1; anchors.verticalCenter: parent.verticalCenter
            Repeater {
                model: 3
                Digit7Seg {
                    value: { var s = Math.floor(root.position).toString(); while (s.length < 3) s = "0" + s; return s[index]; }
                    lit: root.state !== "stopped"
                }
            }
            Rectangle { width: 3; height: 18; color: "transparent"
                Rectangle { anchors.centerIn: parent; width: 1.5; height: 1.5; color: root.ledAmber; opacity: 0.4 }
            }
        }

        // VU L (LED fines horizontales)
        Column {
            spacing: 0; anchors.verticalCenter: parent.verticalCenter
            Text { text: "L"; color: "#4a5060"; font.pixelSize: 5; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
            Row {
                spacing: 1
                Repeater {
                    model: 16
                    Rectangle {
                        width: 1.8; height: 3; radius: 0.5
                        property real threshold: (15 - index) / 16.0
                        color: {
                            if (index < 3) return root.ledRed;
                            if (index < 7) return root.ledAmber;
                            return root.ledGreen;
                        }
                        opacity: root.vuLeft > threshold ? 0.95 : 0.1
                        Behavior on opacity { NumberAnimation { duration: 45 } }
                    }
                }
            }
        }

        // VU R
        Column {
            spacing: 0; anchors.verticalCenter: parent.verticalCenter
            Text { text: "R"; color: "#4a5060"; font.pixelSize: 5; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter }
            Row {
                spacing: 1
                Repeater {
                    model: 16
                    Rectangle {
                        width: 1.8; height: 3; radius: 0.5
                        property real threshold: (15 - index) / 16.0
                        color: {
                            if (index < 3) return root.ledRed;
                            if (index < 7) return root.ledAmber;
                            return root.ledGreen;
                        }
                        opacity: root.vuRight > threshold ? 0.95 : 0.1
                        Behavior on opacity { NumberAnimation { duration: 45 } }
                    }
                }
            }
        }

        // Dolby
        Column {
            spacing: 2; anchors.verticalCenter: parent.verticalCenter
            Text { text: "DOLBY"; color: "#2a4a2a"; font.pixelSize: 5; font.bold: true }
            Text { text: "B NR"; color: "#2a4a2a"; font.pixelSize: 5; font.bold: true }
            Rectangle { width: 14; height: 2.5; radius: 1
                color: root.state === "playing" ? root.ledGreen : "#0e0f12"; opacity: 0.6
                Behavior on color { ColorAnimation { duration: 200 } }
            }
        }
    }

    // Marque deck
    Text {
        anchors { left: parent.left; leftMargin: 10; top: parent.top; topMargin: 5 }
        text: "SONY TC-K630ES"; color: root.chrome
        font.family: "DejaVu Sans Mono"; font.pixelSize: 6; opacity: 0.3
    }

    // Touches
    Row {
        anchors { right: parent.right; rightMargin: 10; top: parent.top; topMargin: 4 }
        spacing: 2
        Repeater {
            model: [{ label: "PLAY", color: root.ledGreen }, { label: "REC", color: root.ledRed }, { label: "STOP", color: root.chrome }]
            Rectangle {
                width: 22; height: 10; radius: 2
                color: root.state === "playing" && modelData.label === "PLAY"
                       ? Qt.rgba(modelData.color.r, modelData.color.g, modelData.color.b, 0.18) : "#0c0d10"
                border.color: modelData.color; border.width: 0.5; opacity: 0.5
                Text { anchors.centerIn: parent; text: modelData.label; color: root.state === "playing" && modelData.label === "PLAY" ? modelData.color : Qt.darker(modelData.color, 2.8); font.family: "DejaVu Sans Mono"; font.pixelSize: 5; font.bold: true }
            }
        }
    }
}
