// Gauge.qml - compteur circulaire anime (une instance par mesure systeme).
//
// L'arc de valeur est dessine par QtQuick.Shapes (geometrie acceleree GPU) et
// sa progression est lissee par une SpringAnimation : chaque jauge possede
// ainsi sa propre dynamique, sans saccade.
import QtQuick 2.15
import QtQuick.Shapes 1.15

Item {
    id: root

    property real value: 0.0
    property real maxValue: 100.0
    property bool autoScale: false       // echelle adaptative (debits reseau)
    property string label: "GAUGE"
    property string unit: "%"
    property int decimals: 0
    property color accent: "#35e6ff"

    implicitWidth: 152
    implicitHeight: 152

    // Echelle : fixe, ou adaptee au maximum observe.
    property real observedMax: 1.0
    readonly property real scaleMax: autoScale ? Math.max(observedMax, 0.5) : maxValue
    onValueChanged: {
        if (autoScale && value * 1.2 > observedMax)
            observedMax = value * 1.2;
        frac = Math.max(0, Math.min(1, value / scaleMax));
    }
    onScaleMaxChanged: frac = Math.max(0, Math.min(1, value / scaleMax))

    // Fraction animee 0..1.
    property real frac: 0.0
    Behavior on frac {
        SpringAnimation { spring: 3.0; damping: 0.34; mass: 0.6; epsilon: 0.002 }
    }

    readonly property real arcStart: 130
    readonly property real arcSpan: 280
    readonly property real cxv: width / 2
    readonly property real cyv: height / 2
    readonly property real rv: Math.min(width, height) / 2 - 13

    // Piste de fond.
    Shape {
        anchors.fill: parent
        antialiasing: true
        ShapePath {
            strokeColor: "#23262d"
            strokeWidth: 9
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            PathAngleArc {
                centerX: root.cxv; centerY: root.cyv
                radiusX: root.rv; radiusY: root.rv
                startAngle: root.arcStart
                sweepAngle: root.arcSpan
            }
        }
    }
    // Lueur diffuse derriere l'arc de valeur.
    Shape {
        anchors.fill: parent
        antialiasing: true
        opacity: 0.32
        ShapePath {
            strokeColor: root.accent
            strokeWidth: 17
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            PathAngleArc {
                centerX: root.cxv; centerY: root.cyv
                radiusX: root.rv; radiusY: root.rv
                startAngle: root.arcStart
                sweepAngle: root.arcSpan * root.frac
            }
        }
    }
    // Arc de valeur.
    Shape {
        anchors.fill: parent
        antialiasing: true
        ShapePath {
            strokeColor: root.accent
            strokeWidth: 9
            fillColor: "transparent"
            capStyle: ShapePath.RoundCap
            PathAngleArc {
                centerX: root.cxv; centerY: root.cyv
                radiusX: root.rv; radiusY: root.rv
                startAngle: root.arcStart
                sweepAngle: root.arcSpan * root.frac
            }
        }
    }

    // Valeur numerique au centre.
    Column {
        anchors.centerIn: parent
        spacing: 1
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.value.toFixed(root.decimals)
            color: root.accent
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 24
            font.bold: true
        }
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            text: root.unit
            color: "#7c858d"
            font.family: "DejaVu Sans Mono"
            font.pixelSize: 9
            font.bold: true
        }
    }
    // Etiquette de la mesure.
    Text {
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 1
        text: root.label
        color: "#9aa3ab"
        font.family: "DejaVu Sans Mono"
        font.pixelSize: 9
        font.bold: true
    }
}
