#!/bin/bash
# ============================================================================
# KYRONEX HYPER FLUID - Script de Test
# ============================================================================
# Date: 2026-07-29
# Objectif: Tester les configurations HYPER FLUID sur les deux Jetson
# ============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  KYRONEX HYPER FLUID - TESTS${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

# ============================================================================
# Configuration
# ============================================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KARR_IP="$(python3 "$SCRIPT_DIR/jetson_network.py" host karr_dadoo)"
K4000_IP="$(python3 "$SCRIPT_DIR/jetson_network.py" host kitt_k4000)"
TIMEOUT=30  # Timeout en secondes pour les tests

# ============================================================================
# Fonction de test
# ============================================================================
test_endpoint() {
    local ip=$1
    local port=$2
    local name=$3
    local endpoint=$4
    
    echo -n "Test de $name ($ip:$port/$endpoint)... "
    
    if curl -s -m $TIMEOUT "http://$ip:$port/$endpoint" > /dev/null 2>&1; then
        response_time=$(curl -o /dev/null -s -w "%{time_total}" "http://$ip:$port/$endpoint")
        echo -e "${GREEN}✓ OK${NC} (temps: ${response_time}s)"
        return 0
    else
        echo -e "${RED}✗ ÉCHEC${NC}"
        return 1
    fi
}

test_streaming() {
    local ip=$1
    local port=$2
    local name=$3
    local message=$4
    
    echo -n "Test streaming $name ($ip:$port)... "
    
    # Tester avec curl en mode streaming
    response=$(curl -s -m $TIMEOUT \
        -X POST "http://$ip:$port/api/chat/stream" \
        -H "Content-Type: application/json" \
        -d "{\"message\": \"$message\", \"audio\": false, \"stream\": true}" \
        -w "\n%{time_total}" \
        2>/dev/null || true)
    
    # Vérifier si on a reçu du texte
    if echo "$response" | grep -q "token"; then
        runtime=$(echo "$response" | tail -1)
        echo -e "${GREEN}✓ OK${NC} (temps: ${runtime}s)"
        return 0
    else
        echo -e "${RED}✗ ÉCHEC${NC} (pas de réponse streaming)"
        return 1
    fi
}

test_audio_streaming() {
    local ip=$1
    local port=$2
    local name=$3
    
    echo -n "Test audio streaming $name ($ip:$port)... "
    
    # Tester avec audio activé
    response=$(curl -s -m $TIMEOUT \
        -X POST "http://$ip:$port/api/chat/stream" \
        -H "Content-Type: application/json" \
        -d '{"message": "Bonjour, comment ça va ?", "audio": true, "stream": true}' \
        -w "\n%{time_total}" \
        2>/dev/null || true)
    
    # Vérifier si on a reçu du texte ou de l'audio
    if echo "$response" | grep -qE "(token|audio_chunk)"; then
        runtime=$(echo "$response" | tail -1)
        echo -e "${GREEN}✓ OK${NC} (temps: ${runtime}s)"
        return 0
    else
        echo -e "${RED}✗ ÉCHEC${NC} (pas de streaming audio)"
        return 1
    fi
}

# ============================================================================
# Tests KARR Dadou (karr_dadoo)
# ============================================================================
echo -e "${YELLOW}[TEST] KARR Dadou (Orin Nano 8Go)${NC}"
echo "------------------------------------------"

# Test santé
if test_endpoint "$KARR_IP" 3000 "KARR" "api/health"; then
    karr_health=true
else
    karr_health=false
    echo -e "${RED}  → KARR non disponible, test annulé${NC}"
fi

# Test streaming texte
if [ "$karr_health" = true ]; then
    if test_streaming "$KARR_IP" 3000 "KARR" "Bonjour KARR"; then
        karr_streaming=true
    else
        karr_streaming=false
    fi
    
    # Test streaming audio
    if test_audio_streaming "$KARR_IP" 3000 "KARR"; then
        karr_audio=true
    else
        karr_audio=false
        echo -e "  ${RED}→ Audio streaming désactivé ou erreur${NC}"
    fi
fi

echo ""

# ============================================================================
# Tests K-4000 (kitt_k4000)
# ============================================================================
echo -e "${YELLOW}[TEST] K-4000 (Orin NX 8Go)${NC}"
echo "------------------------------------------"

# Test santé
if test_endpoint "$K4000_IP" 3000 "K-4000" "api/health"; then
    k4000_health=true
else
    k4000_health=false
    echo -e "${RED}  → K-4000 non disponible, test annulé${NC}"
fi

# Test streaming texte
if [ "$k4000_health" = true ]; then
    if test_streaming "$K4000_IP" 3000 "K-4000" "Bonjour K4000"; then
        k4000_streaming=true
    else
        k4000_streaming=false
    fi
    
    # Test streaming audio
    if test_audio_streaming "$K4000_IP" 3000 "K-4000"; then
        k4000_audio=true
    else
        k4000_audio=false
        echo -e "  ${RED}→ Audio streaming désactivé ou erreur${NC}"
    fi
fi

echo ""

# ============================================================================
# Rapport
# ============================================================================
echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}  RAPPORT DE TEST${NC}"
echo -e "${BLUE}==========================================${NC}"
echo ""

karr_score=0
k4000_score=0

echo -e "${YELLOW}KARR Dadou (karr_dadoo):${NC}"
if [ "$karr_health" = true ]; then
    echo "  ✓ Santé: OK"
    karr_score=$((karr_score + 1))
else
    echo "  ✗ Santé: ÉCHEC"
fi

if [ "$karr_streaming" = true ]; then
    echo "  ✓ Streaming texte: OK"
    karr_score=$((karr_score + 1))
else
    echo "  ✗ Streaming texte: ÉCHEC"
fi

if [ "$karr_audio" = true ]; then
    echo "  ✓ Streaming audio: OK"
    karr_score=$((karr_score + 1))
else
    echo "  ✗ Streaming audio: ÉCHEC (ou non testé)"
fi

echo "  Score: $karr_score/3"
echo ""

echo -e "${YELLOW}K-4000 (kitt_k4000):${NC}"
if [ "$k4000_health" = true ]; then
    echo "  ✓ Santé: OK"
    k4000_score=$((k4000_score + 1))
else
    echo "  ✗ Santé: ÉCHEC"
fi

if [ "$k4000_streaming" = true ]; then
    echo "  ✓ Streaming texte: OK"
    k4000_score=$((k4000_score + 1))
else
    echo "  ✗ Streaming texte: ÉCHEC"
fi

if [ "$k4000_audio" = true ]; then
    echo "  ✓ Streaming audio: OK"
    k4000_score=$((k4000_score + 1))
else
    echo "  ✗ Streaming audio: ÉCHEC (ou non testé)"
fi

echo "  Score: $k4000_score/3"
echo ""

# ============================================================================
# Conclusion
# ============================================================================
total_score=$((karr_score + k4000_score))
max_score=6

if [ $total_score -eq $max_score ]; then
    echo -e "${GREEN}✓ TOUS LES TESTS RÉUSSIS !${NC}"
    echo "  Les deux chatbots sont HYPER FLUIDES et prêts !"
elif [ $total_score -ge $((max_score - 2)) ]; then
    echo -e "${YELLOW}⚠ QUELQUES PROBLÈMES${NC}"
    echo "  La plupart des tests ont réussi, mais certains ont échoué."
else
    echo -e "${RED}✗ PROBLÈMES MAJEURS${NC}"
    echo "  Plusieurs tests ont échoué. Vérifiez les configurations."
fi

echo ""
echo -e "${BLUE}==========================================${NC}"
echo "Fin des tests"
echo "=========================================="

# Sauvegarder les résultats
echo "$(date '+%Y-%m-%d %H:%M:%S') - Test HYPER FLUID" >> /tmp/kyronex_test_results.log
echo "KARR: $karr_score/3" >> /tmp/kyronex_test_results.log
echo "K-4000: $k4000_score/3" >> /tmp/kyronex_test_results.log
echo "Total: $total_score/$max_score" >> /tmp/kyronex_test_results.log
echo "" >> /tmp/kyronex_test_results.log