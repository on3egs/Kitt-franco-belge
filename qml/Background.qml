// Background.qml - fond anime discret, entierement accelere GPU.
//
// Trois couches legeres : un degrade profond, une grille futuriste dessinee
// une seule fois, et des braises en particules. L'ensemble reagit doucement
// a la musique via la propriete "energy" (niveau des basses).
import QtQuick 2.15
import QtQuick.Particles 2.15

Item {
    id: bg

    property real energy: 0.0     // 0..1, pilote par les basses
    property bool lite: false     // mode allege : coupe grille animee + particules

    // Degrade de base.
    Rectangle {
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#080b0f" }
            GradientStop { position: 0.55; color: "#040506" }
            GradientStop { position: 1.0; color: "#0a0406" }
        }
    }

    // Lueur centrale qui respire avec la musique.
    Rectangle {
        anchors.centerIn: parent
        width: parent.width * 0.92
        height: parent.height * 0.70
        radius: Math.min(width, height) / 2
        color: "#0e1a22"
        opacity: 0.12 + bg.energy * 0.26
        Behavior on opacity { NumberAnimation { duration: 130 } }
    }

    // Grille futuriste, dessinee une seule fois (redessinee au redimensionnement).
    Canvas {
        id: grid
        anchors.fill: parent
        opacity: 0.5
        onWidthChanged: requestPaint()
        onHeightChanged: requestPaint()
        onPaint: {
            var ctx = getContext("2d");
            ctx.reset();
            ctx.lineWidth = 1;
            ctx.strokeStyle = "#0c151b";
            for (var y = 0; y < height; y += 27) {
                ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            }
            ctx.strokeStyle = "#120407";
            for (var x = 0; x < width; x += 66) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
            }
        }
        SequentialAnimation on opacity {
            loops: Animation.Infinite
            running: !bg.lite
            NumberAnimation { to: 0.62; duration: 4500; easing.type: Easing.InOutSine }
            NumberAnimation { to: 0.38; duration: 4500; easing.type: Easing.InOutSine }
        }
    }

    // Braises lentes (desactivees en mode allege pour menager les petits Jetson).
    ParticleSystem {
        anchors.fill: parent
        running: !bg.lite

        ImageParticle {
            source: "qrc:///particleresources/fuzzydot.png"
            color: "#8a1c26"
            colorVariation: 0.45
            alpha: 0.35
            entryEffect: ImageParticle.Fade
        }
        Emitter {
            anchors.fill: parent
            emitRate: 5 + bg.energy * 26
            lifeSpan: 9000
            lifeSpanVariation: 2500
            size: 7
            sizeVariation: 9
            endSize: 0
            velocity: AngleDirection {
                angle: 270; angleVariation: 22
                magnitude: 13; magnitudeVariation: 9
            }
        }
    }
}
