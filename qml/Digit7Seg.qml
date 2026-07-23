// Digit7Seg.qml - chiffre afficheur 7 segments.
//
// Dessine un caractere unique (0-9) avec des segments lumineux style LED
// ambre/rouge. Chaque segment est un petit rectangle arrondi avec glow.
import QtQuick 2.15

Item {
    id: root
    property string value: "0"
    property bool lit: true
    property color segColor: "#ffc24b"
    property color segDim: "#1a1510"

    width: 16
    height: 26

    // Table des segments allumes par chiffre : [a,b,c,d,e,f,g]
    property var segments: {
        "0": [1,1,1,1,1,1,0],
        "1": [0,1,1,0,0,0,0],
        "2": [1,1,0,1,1,0,1],
        "3": [1,1,1,1,0,0,1],
        "4": [0,1,1,0,0,1,1],
        "5": [1,0,1,1,0,1,1],
        "6": [1,0,1,1,1,1,1],
        "7": [1,1,1,0,0,0,0],
        "8": [1,1,1,1,1,1,1],
        "9": [1,1,1,1,0,1,1],
        " ": [0,0,0,0,0,0,0]
    }

    // Indices: 0=a(haut), 1=b(haut-droit), 2=c(bas-droit), 3=d(bas), 4=e(bas-gauche), 5=f(haut-gauche), 6=g(milieu)

    function segOn(idx) {
        var s = segments[value] || segments[" "];
        return lit && s[idx];
    }

    // Segment A (haut)
    Segment { x: 3; y: 0; width: 10; height: 3; on: segOn(0); accent: root.segColor; dim: root.segDim }
    // Segment B (haut-droite)
    Segment { x: 13; y: 2; width: 3; height: 10; on: segOn(1); accent: root.segColor; dim: root.segDim }
    // Segment C (bas-droite)
    Segment { x: 13; y: 14; width: 3; height: 10; on: segOn(2); accent: root.segColor; dim: root.segDim }
    // Segment D (bas)
    Segment { x: 3; y: 23; width: 10; height: 3; on: segOn(3); accent: root.segColor; dim: root.segDim }
    // Segment E (bas-gauche)
    Segment { x: 0; y: 14; width: 3; height: 10; on: segOn(4); accent: root.segColor; dim: root.segDim }
    // Segment F (haut-gauche)
    Segment { x: 0; y: 2; width: 3; height: 10; on: segOn(5); accent: root.segColor; dim: root.segDim }
    // Segment G (milieu)
    Segment { x: 3; y: 11.5; width: 10; height: 3; on: segOn(6); accent: root.segColor; dim: root.segDim }
}
