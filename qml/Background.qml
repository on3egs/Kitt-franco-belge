// Background.qml - fond immersif, profondeur cinematique.
//
// Atmosphere de studio audio sombre : degrade profond, grille technique,
// orbes flottants, particules de poussiere, scanlines CRT.
import QtQuick 2.15
import QtQuick.Particles 2.15

Item {
    id: bg

    property real energy: 0.0
    property bool lite: false

    // Degrade profond quasi-noir
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#070a0e" }
            GradientStop { position: 0.4; color: "#030408" }
            GradientStop { position: 0.75; color: "#040208" }
            GradientStop { position: 1.0; color: "#08030a" }
        }
    }

    // Lueur radiale centrale ambree (eclairage studio)
    Canvas {
        id: radialGlow
        anchors.fill: parent
        opacity: 0.25 + bg.energy * 0.3
        Behavior on opacity { NumberAnimation { duration: 200 } }
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            var cx = width / 2, cy = height * 0.42;
            var r = Math.max(width, height) * 0.8;
            var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
            g.addColorStop(0.0, "#1a2a35");
            g.addColorStop(0.3, "#0c141c");
            g.addColorStop(0.65, "#06080c");
            g.addColorStop(1.0, "transparent");
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, width, height);
        }
    }

    // Grille technique avec fondu aux bords
    Canvas {
        id: grid
        anchors.fill: parent
        opacity: 0.45
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            ctx.lineWidth = 1;

            for (var y = 0; y < height; y += 26) {
                var fy = y / height;
                var edgeFade = 1.0 - Math.pow(Math.abs(fy - 0.5) * 2.2, 2.5);
                edgeFade = Math.max(0, edgeFade);
                ctx.strokeStyle = "rgba(16, 38, 52, " + (0.4 * edgeFade).toFixed(3) + ")";
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
            for (var x = 0; x < width; x += 60) {
                var fx = x / width;
                var edgeFadeX = 1.0 - Math.pow(Math.abs(fx - 0.5) * 2.2, 2.5);
                edgeFadeX = Math.max(0, edgeFadeX);
                ctx.strokeStyle = "rgba(40, 10, 16, " + (0.3 * edgeFadeX).toFixed(3) + ")";
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
        }
        SequentialAnimation on opacity {
            loops: Animation.Infinite
            running: !bg.lite
            NumberAnimation { to: 0.65; duration: 5500; easing.type: Easing.InOutSine }
            NumberAnimation { to: 0.35; duration: 5500; easing.type: Easing.InOutSine }
        }
    }

    // Orbes flottants
    Repeater {
        model: bg.lite ? 0 : 3
        Rectangle {
            width: 200 + Math.random() * 350
            height: width
            radius: width / 2
            color: ["#1a3a4a", "#2a1020", "#0a1a30"][index % 3]
            opacity: 0.04 + Math.random() * 0.04
            x: Math.random() * (parent.width - width)
            y: Math.random() * (parent.height - height)

            SequentialAnimation on x {
                loops: Animation.Infinite
                NumberAnimation { to: parent.width - width; duration: 20000 + index * 5000; easing.type: Easing.InOutSine }
                NumberAnimation { to: 0; duration: 25000 + index * 4000; easing.type: Easing.InOutSine }
            }
            SequentialAnimation on y {
                loops: Animation.Infinite
                NumberAnimation { to: parent.height - height; duration: 28000 + index * 6000; easing.type: Easing.InOutSine }
                NumberAnimation { to: 0; duration: 22000 + index * 5000; easing.type: Easing.InOutSine }
            }
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                NumberAnimation { to: 0.1; duration: 7000 + index * 3000; easing.type: Easing.InOutSine }
                NumberAnimation { to: 0.03; duration: 9000 + index * 4000; easing.type: Easing.InOutSine }
            }
        }
    }

    // Particules braises
    ParticleSystem {
        anchors.fill: parent
        running: !bg.lite

        ImageParticle {
            source: "qrc:///particleresources/fuzzydot.png"
            color: "#8a2c36"
            colorVariation: 0.5
            alpha: 0.35
            entryEffect: ImageParticle.Fade
        }
        Emitter {
            anchors.fill: parent
            emitRate: 3 + bg.energy * 28
            lifeSpan: 11000
            lifeSpanVariation: 3500
            size: 5
            sizeVariation: 9
            endSize: 0
            velocity: AngleDirection {
                angle: 270; angleVariation: 28
                magnitude: 10; magnitudeVariation: 7
            }
        }
    }

    // Scanlines CRT subtiles
    Canvas {
        anchors.fill: parent
        opacity: 0.03
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            for (var y = 0; y < height; y += 3) {
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, y, width, 1);
            }
        }
    }

    // Vignette (bords sombres)
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "transparent" }
            GradientStop { position: 0.85; color: "transparent" }
            GradientStop { position: 1.0; color: "#020203" }
        }
    }
}
