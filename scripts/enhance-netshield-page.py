from pathlib import Path

page=Path('client/public/netshield/pc.html')
text=page.read_text(encoding='utf-8')

if 'data-demo-bars' not in text:
    rows='''<div class="demo-rows"><div><code>doubleclick.net</code><span data-demo-ad>Bloqué → 0.0.0.0</span></div><div><code>kitt-franco-belge.be</code><span data-demo-site>Autorisé → DNS amont</span></div></div>'''
    chart='''<div class="demo-chart" role="img" aria-label="Graphique fictif des requêtes autorisées et bloquées" data-demo-chart><div class="chart-heading"><strong>Activité de l’exemple</strong><span>7 dernières périodes · valeurs fictives</span></div><div class="chart-bars" data-demo-bars><i style="--h:34%"></i><i style="--h:52%"></i><i style="--h:43%"></i><i style="--h:72%"></i><i style="--h:58%"></i><i style="--h:88%"></i><i style="--h:68%"></i></div><div class="chart-legend"><span><i class="legend-allowed"></i>Requêtes autorisées</span><span><i class="legend-blocked"></i>Domaines bloqués</span></div></div>'''
    if rows not in text:raise SystemExit('Interactive DNS example not found')
    text=text.replace(rows,rows+chart,1)

if 'data-sfx-toggle' not in text:
    marker='</div><div class="demo-board" data-demo-state="active"'
    toggle='''</div><label class="effect-toggle"><input type="checkbox" data-sfx-toggle><span class="effect-switch" aria-hidden="true"></span><span><strong>Effets sonores KITT</strong><small>Petits bips de démonstration · désactivés au départ</small></span></label><div class="demo-board" data-demo-state="active"'''
    if marker not in text:raise SystemExit('Demo controls not found')
    text=text.replace(marker,toggle,1)

if 'data-copy-dns-command' not in text:
    start=text.index('<section class="shell section" id="installation">')
    end=text.index('</section>',start)
    quick='''<div class="quick-check"><div><strong>Contrôler le filtre après activation</strong><p>Quand le tableau de bord indique « DNS local », ouvrez PowerShell et lancez cette vérification. Elle envoie une requête au moteur local, sans modifier vos réglages réseau.</p></div><code data-dns-check-command>Resolve-DnsName doubleclick.net -Type A -Server 127.0.0.1</code><button class="button secondary" type="button" data-copy-dns-command>Copier la commande</button><span data-copy-status role="status" aria-live="polite">Pour un domaine bloqué, la réponse attendue est 0.0.0.0.</span></div>'''
    text=text[:end]+quick+text[end:]

if 'data-rule-domain' not in text:
    faq='<section class="shell section" id="faq">'
    rule='''<section class="shell section" id="outil-regle"><div class="section-head"><div class="tag">Petit outil local</div><h2>Préparez une règle avant de l’ajouter</h2><p>Vérifiez le format d’un domaine et copiez-le ensuite dans l’onglet « Mes règles » de l’application.</p></div><div class="rule-builder"><label for="rule-domain">Nom de domaine <span>(sans https:// ni chemin)</span></label><input id="rule-domain" data-rule-domain type="text" inputmode="url" autocomplete="off" placeholder="ads.exemple.fr" maxlength="254"><div class="rule-actions" role="group" aria-label="Type de règle"><button class="button secondary" type="button" data-rule-type="allow" aria-pressed="false">Autoriser</button><button class="button" type="button" data-rule-type="deny" aria-pressed="true">Bloquer</button></div><p class="rule-result" data-rule-result role="status" aria-live="polite">Saisissez un domaine pour voir l’aperçu de la règle.</p><div class="rule-copy"><code data-rule-output>—</code><button class="button secondary" type="button" data-rule-copy disabled>Copier le domaine</button></div><small>La prévisualisation reste dans cette page. Elle n’ajoute aucune règle à l’application. Les accents doivent être saisis en punycode.</small><span class="copy-status" data-rule-copy-status role="status" aria-live="polite"></span></div></section>'''
    if faq not in text:raise SystemExit('FAQ section not found')
    text=text.replace(faq,rule+faq,1)

if 'pc-extra.css?v=20261026-1' not in text:raise SystemExit('Stylesheet link not found')
page.write_text(text,encoding='utf-8')
