// ============================================
// SPACE INVADERS PRO — Configuration Pilotes
// By Manix - KYRONEXT ARCADE SYSTEM
// ============================================

// ═══════════════════════════════════════════════════════════════
// DONNÉES DES PILOTES
// ═══════════════════════════════════════════════════════════════

const PILOTS = [
    // ═══════════════════════════════════════════════════════════════
    // PILOTES PRINCIPAUX (16 uniques)
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'manix',
        name: 'Manix',
        call: 'Manix',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/manix.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/manix.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-manix-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/manix.png',
        shipColor: '#ff0000',
        secondaryColor: '#ff4444',
        specialAbility: 'Turbo Boost',
        specialDescription: 'Vitesse x2.5 pendant 5 secondes',
        specialDuration: 5000,
        specialCooldown: 15000,
        fireRate: 250,
        baseHealth: 100,
        quote: '"On va leur montrer ce qu\'un vrai pilote vaut !"',
        story: 'Ancien champion de course spatiale, Manix a rejoint KITT pour défendre la Terre. Son vaisseau rouge est une légende parmi les pilotes.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 10,
            damage: 10,
            defense: 8,
            energy: 8
        }
    },
    {
        id: 'dadoo',
        name: 'Dadoo',
        call: 'Dadoo',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/dadoo.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/dadoo.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-dadoo-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/dadoo.png',
        shipColor: '#00ff00',
        secondaryColor: '#00aa00',
        specialAbility: 'Shield Wall',
        specialDescription: 'Bouclier invulnérable pendant 8 secondes',
        specialDuration: 8000,
        specialCooldown: 20000,
        fireRate: 300,
        baseHealth: 120,
        quote: '"Personne ne passe !"',
        story: 'Expert en défense, Dadoo est le mur que les envahisseurs ne pourront jamais franchir. Son bouclier vert est impénétrable.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 7,
            damage: 8,
            defense: 12,
            energy: 6
        }
    },
    {
        id: 'pascal',
        name: 'Pascal Ferron',
        call: 'Pascal',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/pascal-ferron.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/pascal-ferron.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-pascal-ferron-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/pascal.png',
        shipColor: '#0000ff',
        secondaryColor: '#4444ff',
        specialAbility: 'Triple Shot',
        specialDescription: 'Tir triple simultané pendant 6 secondes',
        specialDuration: 6000,
        specialCooldown: 18000,
        fireRate: 200,
        baseHealth: 90,
        quote: '"Précision et puissance !"',
        story: 'Ingénieur de génie, Pascal a conçu son vaisseau bleu pour une puissance de feu maximale. Ses tirs triples dévastent les rangs ennemis.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 8,
            damage: 12,
            defense: 7,
            energy: 7
        }
    },
    {
        id: 'pascal_ki',
        name: 'Pascal K Industries',
        call: 'Pascal K Industries',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/pascal-ki.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/pascal-ki.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-pascal-ki-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/pascal.png',
        shipColor: '#ff3300',
        secondaryColor: '#ff9900',
        specialAbility: 'Turbo Boost',
        specialDescription: 'Vitesse et cadence augmentées pendant 7 secondes',
        specialDuration: 7000,
        specialCooldown: 18000,
        fireRate: 180,
        baseHealth: 100,
        quote: '"K Industries, pleine puissance !"',
        story: 'Pascal K Industries dirige un atelier spécialisé dans les voitures K2000. Sa spécialité : préparer des machines fiables, rapides et prêtes pour le Turbo Boost.',
        unlocked: true,
        price: 0,
        stats: { speed: 12, damage: 11, defense: 9, energy: 8 }
    },
    {
        id: 'kr95',
        name: 'KR-95',
        call: 'Ké-Ré-95',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/kr95.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/kr95.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-kr95-uniform.webp',
        ship: '/static/games/space_invaders_pro/assets/ships/kr95.png',
        shipColor: '#ff00ff',
        secondaryColor: '#aa00aa',
        specialAbility: 'Phase Shift',
        specialDescription: 'Devenez intangible pendant 4 secondes',
        specialDuration: 4000,
        specialCooldown: 12000,
        fireRate: 280,
        baseHealth: 80,
        quote: '"Je suis partout et nulle part !"',
        story: 'Agent secret de KITT, KR-95 utilise une technologie expérimentale pour disparaître des radars ennemis. Son vaisseau violet est presque invisible.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 12,
            damage: 7,
            defense: 6,
            energy: 10
        }
    },
    {
        id: 'guy',
        name: 'Guy Chapellier',
        call: 'Guy',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/guy-chapelier.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/guy-chapelier.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-guy-chapellier-uniform.webp',
        ship: '/static/games/space_invaders_pro/assets/ships/guy.png',
        shipColor: '#ffff00',
        secondaryColor: '#dddd00',
        specialAbility: 'Piercing Laser',
        specialDescription: 'Laser traversant qui perce plusieurs ennemis',
        specialDuration: 7000,
        specialCooldown: 20000,
        fireRate: 350,
        baseHealth: 100,
        quote: '"Une seule shot, et c\'est fini !"',
        story: 'Sniper d\'élite, Guy Chapellier ne rate jamais sa cible. Son laser jaune traverse tout sur son passage.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 9,
            damage: 15,
            defense: 8,
            energy: 5
        }
    },
    {
        id: 'cedric',
        name: 'Cédric',
        call: 'Cédric',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/cedric.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/cedric.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-cedric-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/cedric.png',
        shipColor: '#00ffff',
        secondaryColor: '#00aaaa',
        specialAbility: 'Freeze Ray',
        specialDescription: 'Gèle tous les ennemis pendant 3 secondes',
        specialDuration: 3000,
        specialCooldown: 25000,
        fireRate: 300,
        baseHealth: 95,
        quote: '"Gel total !"',
        story: 'Scientifique fou, Cédric a équipé son vaisseau cyan d\'un canon à gel. Les envahisseurs deviennent des statues de glace.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 8,
            damage: 9,
            defense: 9,
            energy: 8
        }
    },
    {
        id: 'virginie',
        name: 'Virginie',
        call: 'Virginie',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/virginie.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/virginie.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-virginie-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/virginie.png',
        shipColor: '#ff8800',
        secondaryColor: '#aa6600',
        specialAbility: 'Heal Pulse',
        specialDescription: 'Régénère 50% de la vie instantanément',
        specialDuration: 1000,
        specialCooldown: 30000,
        fireRate: 250,
        baseHealth: 85,
        quote: '"Un peu de soin, ça fait du bien !"',
        story: 'Médecin de bord, Virginie veille sur ses coéquipiers. Son pouvoir de guérison a sauvé d\'innombrables vies.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 7,
            damage: 8,
            defense: 10,
            energy: 9
        }
    },
    {
        id: 'frank',
        name: 'Frank',
        call: 'Frank',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/frank.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/frank.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-frank-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/frank.png',
        shipColor: '#8800ff',
        secondaryColor: '#6600aa',
        specialAbility: 'Nova Bomb',
        specialDescription: 'Explosion massive autour du vaisseau',
        specialDuration: 1000,
        specialCooldown: 30000,
        fireRate: 400,
        baseHealth: 110,
        quote: '"Ça va péter !"',
        story: 'Démolisseur né, Frank adore les grosses explosions. Sa Nova Bomb détruit tout dans un large rayon.',
        unlocked: true,
        price: 0,
        stats: {
            speed: 6,
            damage: 18,
            defense: 10,
            energy: 4
        }
    },
    // ═══════════════════════════════════════════════════════════════
    // PILOTES DÉBLOQUABLES
    // ═══════════════════════════════════════════════════════════════
    {
        id: 'alexia',
        name: 'Alexia',
        call: 'Alexia',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/alexia.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/alexia.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-alexia-racer.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/alexia.png',
        shipColor: '#ff0088',
        secondaryColor: '#aa0066',
        specialAbility: 'Homing Missiles',
        specialDescription: 'Missiles guidés qui suivent les ennemis',
        specialDuration: 5000,
        specialCooldown: 20000,
        fireRate: 350,
        baseHealth: 90,
        quote: '"Ils ne m\'échapperont pas !"',
        story: 'Chasseuse de primes, Alexia traque ses cibles sans relâche. Ses missiles roses suivent les ennemis jusqu\'au bout de l\'univers.',
        unlocked: false,
        price: 500,
        stats: {
            speed: 9,
            damage: 11,
            defense: 7,
            energy: 8
        }
    },
    {
        id: 'bastien',
        name: 'Bastien',
        call: 'Bastien',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/bastien.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/bastien.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-bastien-racer.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/bastien.png',
        shipColor: '#00ff88',
        secondaryColor: '#00aa66',
        specialAbility: 'Rapid Fire',
        specialDescription: 'Cadence de tir x2 pendant 8 secondes',
        specialDuration: 8000,
        specialCooldown: 20000,
        fireRate: 150,
        baseHealth: 80,
        quote: '"Plus vite, plus fort !"',
        story: 'Tireur d\'élite, Bastien peut vider un chargeur entier en quelques secondes. Son vaisseau vert fluo est une machine à tuer.',
        unlocked: false,
        price: 500,
        stats: {
            speed: 8,
            damage: 14,
            defense: 6,
            energy: 7
        }
    },
    {
        id: 'elsa',
        name: 'Elsa',
        call: 'Elsa',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/elsa.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/elsa.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-elsa-racer.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/elsa.png',
        shipColor: '#88ffff',
        secondaryColor: '#66aaaa',
        specialAbility: 'Energy Shield',
        specialDescription: 'Bouclier qui absorbe 80% des dégâts pendant 6 secondes',
        specialDuration: 6000,
        specialCooldown: 18000,
        fireRate: 280,
        baseHealth: 130,
        quote: '"Sous ma protection !"',
        story: 'Garde du corps, Elsa protège ses alliés à tout prix. Son bouclier cyan est presque impénétrable.',
        unlocked: false,
        price: 700,
        stats: {
            speed: 7,
            damage: 8,
            defense: 15,
            energy: 6
        }
    },
    {
        id: 'laura',
        name: 'Laura',
        call: 'Laura',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/laura.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/laura.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-laura-racer.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/laura.png',
        shipColor: '#ff88ff',
        secondaryColor: '#aa66aa',
        specialAbility: 'Life Steal',
        specialDescription: 'Vol de vie : chaque tir restaure 10% de la vie',
        specialDuration: 10000,
        specialCooldown: 25000,
        fireRate: 300,
        baseHealth: 95,
        quote: '"Leur énergie me donne la vie !"',
        story: 'Vampire de l\'espace, Laura puise l\'énergie de ses ennemis pour se soigner. Son vaisseau rose est redoutable en combat prolongé.',
        unlocked: false,
        price: 800,
        stats: {
            speed: 8,
            damage: 10,
            defense: 9,
            energy: 8
        }
    },
    {
        id: 'lilou',
        name: 'Lilou',
        call: 'Lilou',
        voiceFile: '/static/kitt-stunt-racing/audio/pilots/lilou.wav',
        storyFile: '/static/kitt-stunt-racing/audio/stories/lilou.wav',
        portrait: '/static/kitt-stunt-racing/assets/pilot-lilou-racer.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/lilou.png',
        shipColor: '#ffff88',
        secondaryColor: '#aaaa66',
        specialAbility: 'Lucky Shot',
        specialDescription: 'Tir critique aléatoire (x3 dégâts) toutes les 10 secondes',
        specialDuration: 10000,
        specialCooldown: 15000,
        fireRate: 200,
        baseHealth: 70,
        quote: '"J\'ai de la chance aujourd\'hui !"',
        story: 'Aventurière audacieuse, Lilou compte sur sa chance pour survivre. Ses tirs jaunes peuvent créer des dégâts imprévisibles.',
        unlocked: false,
        price: 600,
        stats: {
            speed: 11,
            damage: 13,
            defense: 5,
            energy: 9
        }
    },
    {
        id: 'momo',
        name: 'Momo',
        call: 'Momo',
        voiceFile: '/static/games/space_invaders_pro/assets/sounds/voices/momo.mp3',
        storyFile: '/static/kitt-stunt-racing/audio/stories/cedric.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-cedric-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/momo.png',
        shipColor: '#88ff00',
        secondaryColor: '#66aa00',
        specialAbility: 'EMP Pulse',
        specialDescription: 'Désactive tous les ennemis pendant 4 secondes',
        specialDuration: 4000,
        specialCooldown: 30000,
        fireRate: 350,
        baseHealth: 100,
        quote: '"Plus un bruit !"',
        story: 'Hacker de génie, Momo peut désactiver les systèmes ennemis d\'un simple pulsion. Son vaisseau vert fluo est discret mais mortel.',
        unlocked: false,
        price: 700,
        stats: {
            speed: 10,
            damage: 9,
            defense: 8,
            energy: 10
        }
    },
    {
        id: 'rider_j',
        name: 'Rider J',
        call: 'Rider J',
        voiceFile: '/static/games/space_invaders_pro/assets/sounds/voices/rider_j.mp3',
        storyFile: '/static/kitt-stunt-racing/audio/stories/john.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-rider-j-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/rider_j.png',
        shipColor: '#0088ff',
        secondaryColor: '#0066aa',
        specialAbility: 'Afterburner',
        specialDescription: 'Accélération continue pendant 6 secondes',
        specialDuration: 6000,
        specialCooldown: 20000,
        fireRate: 280,
        baseHealth: 105,
        quote: '"À toute vitesse !"',
        story: 'Pilote de course extrême, Rider J maîtrise la vitesse comme personne. Son vaisseau bleu foncé est une flèche dans l\'espace.',
        unlocked: false,
        price: 600,
        stats: {
            speed: 15,
            damage: 7,
            defense: 8,
            energy: 7
        }
    },
    {
        id: 'anthony_douman',
        name: 'Anthony Doumeng',
        call: 'Anthony',
        portrait: '/static/games/space_invaders_pro/assets/portraits/anthony_douman.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/rider_j.png',
        shipColor: '#d41414',
        secondaryColor: '#8b0000',
        specialAbility: 'Precision Lock',
        specialDescription: 'Tirs plus précis et rapides pendant 6 secondes',
        specialDuration: 6000,
        specialCooldown: 18000,
        fireRate: 230,
        baseHealth: 100,
        quote: '"Toulouse en ligne. Cible verrouillée !"',
        story: 'Anthony Doumeng, pilote Kyronext basé à Toulouse, rejoint l’escadrille pour les missions spatiales.',
        unlocked: true,
        price: 0,
        stats: { speed: 10, damage: 10, defense: 9, energy: 9 }
    },
    {
        id: 'manix_racer',
        name: 'Manix (Racer)',
        call: 'Manix Racer',
        voiceFile: '/static/games/space_invaders_pro/assets/sounds/voices/manix_racer.mp3',
        storyFile: '/static/kitt-stunt-racing/audio/stories/manix.wav',
        portrait: '/static/kitt-stunt-racing/assets/portrait-manix-uniform.jpg',
        ship: '/static/games/space_invaders_pro/assets/ships/manix_racer.png',
        shipColor: '#ff4400',
        secondaryColor: '#aa3300',
        specialAbility: 'Double Damage',
        specialDescription: 'Dégâts x2 pendant 7 secondes',
        specialDuration: 7000,
        specialCooldown: 20000,
        fireRate: 250,
        baseHealth: 100,
        quote: '"Je suis né pour gagner !"',
        story: 'Version Racer de Manix. Encore plus rapide, encore plus mortel. Son vaisseau rouge foncé est la terreur des circuits spatiaux.',
        unlocked: false,
        price: 1000,
        stats: {
            speed: 13,
            damage: 16,
            defense: 8,
            energy: 6
        }
    }
];

// ═══════════════════════════════════════════════════════════════
// CONFIGURATION PAR JETSON
// ═══════════════════════════════════════════════════════════════

const JETSON_CONFIG = {
    ajx: {
        name: 'AJX',
        theme: {
            primary: '#ff0000',
            secondary: '#000000',
            accent: '#ff4444',
            bg: 'rgba(30, 0, 0, 0.9)'
        },
        defaultPilots: ['manix', 'dadoo', 'kr95', 'frank'],
        boss: {
            name: 'KITT-9000',
            description: 'Le système de défense ultime de KITT, corrompu par les envahisseurs.',
            color: '#ff0000',
            health: 5000,
            image: '/static/games/space_invaders_pro/assets/bg/boss_kitt9000.png'
        },
        music: '/static/games/space_invaders_pro/assets/sounds/music/ajx_theme.mp3',
        banner: 'KYRONEXT - AJX ARCADE'
    },
    manix: {
        name: 'Manix',
        theme: {
            primary: '#00aaff',
            secondary: '#ffd700',
            accent: '#00ffff',
            bg: 'rgba(0, 30, 60, 0.9)'
        },
        defaultPilots: ['manix', 'pascal', 'guy', 'bastien'],
        boss: {
            name: 'Golden Invader',
            description: 'Le chef des envahisseurs, recouvert d\'or pur.',
            color: '#ffd700',
            health: 6000,
            image: '/static/games/space_invaders_pro/assets/bg/boss_golden.png'
        },
        music: '/static/games/space_invaders_pro/assets/sounds/music/manix_theme.mp3',
        banner: 'KYRONEXT - MANIX ARCADE'
    },
    pascal: {
        name: 'Pascal',
        theme: {
            primary: '#00ff88',
            secondary: '#8800ff',
            accent: '#00aa88',
            bg: 'rgba(0, 60, 30, 0.9)'
        },
        defaultPilots: ['pascal', 'cedric', 'virginie', 'elsa'],
        boss: {
            name: 'Matrix Queen',
            description: 'Une intelligence artificielle malveillante qui contrôle les envahisseurs.',
            color: '#00ff88',
            health: 7000,
            image: '/static/games/space_invaders_pro/assets/bg/boss_matrix.png'
        },
        music: '/static/games/space_invaders_pro/assets/sounds/music/pascal_theme.mp3',
        banner: 'KYRONEXT - PASCAL ARCADE'
    }
};

// ═══════════════════════════════════════════════════════════════
// TYPES D'ENNEMIS
// ═══════════════════════════════════════════════════════════════

const ENEMY_TYPES = [
    {
        id: 'scout',
        name: 'Éclaireur',
        color: '#ff4444',
        health: 30,
        points: 100,
        credits: 5,
        speed: 0.5,
        size: 1,
        sprite: '/static/games/space_invaders_pro/assets/ships/enemies/scout.png'
    },
    {
        id: 'fighter',
        name: 'Chasseur',
        color: '#44ff44',
        health: 50,
        points: 200,
        credits: 10,
        speed: 0.3,
        size: 1.2,
        sprite: '/static/games/space_invaders_pro/assets/ships/enemies/fighter.png'
    },
    {
        id: 'bomber',
        name: 'Bombardier',
        color: '#4444ff',
        health: 80,
        points: 300,
        credits: 15,
        speed: 0.2,
        size: 1.5,
        sprite: '/static/games/space_invaders_pro/assets/ships/enemies/bomber.png'
    },
    {
        id: 'drone',
        name: 'Drone',
        color: '#ffaa00',
        health: 20,
        points: 150,
        credits: 8,
        speed: 0.7,
        size: 0.8,
        sprite: '/static/games/space_invaders_pro/assets/ships/enemies/drone.png'
    },
    {
        id: 'elite',
        name: 'Élite',
        color: '#ff00ff',
        health: 120,
        points: 400,
        credits: 25,
        speed: 0.4,
        size: 1.3,
        sprite: '/static/games/space_invaders_pro/assets/ships/enemies/elite.png'
    }
];

// ═══════════════════════════════════════════════════════════════
// NIVEAUX DE DIFFICULTÉ
// ═══════════════════════════════════════════════════════════════

const DIFFICULTY_LEVELS = [
    {
        name: 'Facile',
        enemySpeed: 0.5,
        spawnRate: 2000,
        enemyTypes: ['scout', 'drone'],
        bossHealthMultiplier: 0.8,
        creditsMultiplier: 1.0
    },
    {
        name: 'Normal',
        enemySpeed: 0.7,
        spawnRate: 1500,
        enemyTypes: ['scout', 'fighter', 'drone'],
        bossHealthMultiplier: 1.0,
        creditsMultiplier: 1.0
    },
    {
        name: 'Difficile',
        enemySpeed: 0.9,
        spawnRate: 1000,
        enemyTypes: ['scout', 'fighter', 'bomber', 'drone'],
        bossHealthMultiplier: 1.2,
        creditsMultiplier: 1.5
    },
    {
        name: 'Expert',
        enemySpeed: 1.1,
        spawnRate: 800,
        enemyTypes: ['scout', 'fighter', 'bomber', 'drone', 'elite'],
        bossHealthMultiplier: 1.5,
        creditsMultiplier: 2.0
    },
    {
        name: 'Insane',
        enemySpeed: 1.3,
        spawnRate: 600,
        enemyTypes: ['scout', 'fighter', 'bomber', 'drone', 'elite'],
        bossHealthMultiplier: 2.0,
        creditsMultiplier: 3.0
    }
];

// ═══════════════════════════════════════════════════════════════
// AMÉLIORATIONS DISPONIBLES
// ═══════════════════════════════════════════════════════════════

const UPGRADES = {
    // Améliorations de tir
    fireRate: [
        { level: 1, name: 'Cadence de Tir I', cost: 100, value: 250, description: '+10% de cadence' },
        { level: 2, name: 'Cadence de Tir II', cost: 250, value: 200, description: '+20% de cadence' },
        { level: 3, name: 'Cadence de Tir III', cost: 500, value: 150, description: '+30% de cadence' },
        { level: 4, name: 'Cadence de Tir IV', cost: 1000, value: 100, description: '+40% de cadence' }
    ],
    damage: [
        { level: 1, name: 'Dégâts I', cost: 150, value: 1.1, description: '+10% de dégâts' },
        { level: 2, name: 'Dégâts II', cost: 400, value: 1.25, description: '+25% de dégâts' },
        { level: 3, name: 'Dégâts III', cost: 800, value: 1.5, description: '+50% de dégâts' },
        { level: 4, name: 'Dégâts IV', cost: 1500, value: 2.0, description: '+100% de dégâts' }
    ],
    // Améliorations de défense
    health: [
        { level: 1, name: 'Vie I', cost: 200, value: 1.1, description: '+10% de vie' },
        { level: 2, name: 'Vie II', cost: 500, value: 1.25, description: '+25% de vie' },
        { level: 3, name: 'Vie III', cost: 1000, value: 1.5, description: '+50% de vie' },
        { level: 4, name: 'Vie IV', cost: 2000, value: 2.0, description: '+100% de vie' }
    ],
    shield: [
        { level: 1, name: 'Bouclier I', cost: 300, value: 0.1, description: '10% de réduction des dégâts' },
        { level: 2, name: 'Bouclier II', cost: 700, value: 0.25, description: '25% de réduction des dégâts' },
        { level: 3, name: 'Bouclier III', cost: 1200, value: 0.4, description: '40% de réduction des dégâts' },
        { level: 4, name: 'Bouclier IV', cost: 2000, value: 0.6, description: '60% de réduction des dégâts' }
    ],
    // Améliorations de puissance
    energy: [
        { level: 1, name: 'Énergie I', cost: 200, value: 1.1, description: '+10% de recharge du pouvoir' },
        { level: 2, name: 'Énergie II', cost: 500, value: 1.25, description: '+25% de recharge du pouvoir' },
        { level: 3, name: 'Énergie III', cost: 1000, value: 1.5, description: '+50% de recharge du pouvoir' }
    ],
    speed: [
        { level: 1, name: 'Vitesse I', cost: 150, value: 1.1, description: '+10% de vitesse' },
        { level: 2, name: 'Vitesse II', cost: 400, value: 1.25, description: '+25% de vitesse' },
        { level: 3, name: 'Vitesse III', cost: 800, value: 1.5, description: '+50% de vitesse' }
    ]
};

// ═══════════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════════

/**
 * Récupère un pilote par son ID
 */
function getPilot(id) {
    return PILOTS.find(p => p.id === id);
}

/**
 * Récupère les pilotes débloqués
 */
function getUnlockedPilots() {
    return PILOTS.filter(p => p.unlocked || localStorage.getItem(`pilot_${p.id}_unlocked`) === 'true');
}

/**
 * Récupère la configuration d'un Jetson
 */
function getJetsonConfig(jetsonName) {
    return JETSON_CONFIG[jetsonName.toLowerCase()] || JETSON_CONFIG.ajx;
}

/**
 * Récupère un type d'ennemi par son ID
 */
function getEnemyType(id) {
    return ENEMY_TYPES.find(e => e.id === id);
}

/**
 * Récupère un niveau de difficulté par son nom
 */
function getDifficultyLevel(name) {
    return DIFFICULTY_LEVELS.find(d => d.name === name);
}

/**
 * Récupère les améliorations d'un type
 */
function getUpgrades(type) {
    return UPGRADES[type] || [];
}

/**
 * Récupère le niveau actuel d'une amélioration
 */
function getUpgradeLevel(type, pilotId) {
    const key = `upgrade_${pilotId}_${type}`;
    const level = parseInt(localStorage.getItem(key) || '0');
    return Math.min(level, getUpgrades(type).length);
}

/**
 * Met à jour le niveau d'une amélioration
 */
function setUpgradeLevel(type, pilotId, level) {
    const key = `upgrade_${pilotId}_${type}`;
    localStorage.setItem(key, level.toString());
}

/**
 * Déverrouille un pilote
 */
function unlockPilot(pilotId) {
    localStorage.setItem(`pilot_${pilotId}_unlocked`, 'true');
    PILOTS.find(p => p.id === pilotId).unlocked = true;
}

/**
 * Récupère le high score
 */
function getHighScore() {
    return parseInt(localStorage.getItem('spaceInvadersProHighScore') || '0');
}

/**
 * Met à jour le high score
 */
function setHighScore(score) {
    if (score > getHighScore()) {
        localStorage.setItem('spaceInvadersProHighScore', score.toString());
    }
}

/**
 * Récupère les crédits totaux
 */
function getTotalCredits() {
    return parseInt(localStorage.getItem('spaceInvadersProTotalCredits') || '0');
}

/**
 * Ajoute des crédits
 */
function addCredits(amount) {
    const current = getTotalCredits();
    localStorage.setItem('spaceInvadersProTotalCredits', (current + amount).toString());
}

// Exporter pour les autres modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        PILOTS,
        JETSON_CONFIG,
        ENEMY_TYPES,
        DIFFICULTY_LEVELS,
        UPGRADES,
        getPilot,
        getUnlockedPilots,
        getJetsonConfig,
        getEnemyType,
        getDifficultyLevel,
        getUpgrades,
        getUpgradeLevel,
        setUpgradeLevel,
        unlockPilot,
        getHighScore,
        setHighScore,
        getTotalCredits,
        addCredits
    };
}
