/**
 * Ch1ffra — app.js
 * Câblage de l'interface : navigation, formulaire de devis, historique, gestion des matières.
 * L'export PDF (bouton présent, non branché) sera ajouté avec jsPDF dans une étape suivante.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ============================================================
  // ÉCRAN DE CHARGEMENT — le logo se trace comme une découpe laser,
  // lettre par lettre, puis se remplit (façon pièce détourée).
  // ============================================================
  (function lancerAnimationChargement() {
    const ecran = document.getElementById('loading-screen');
    if (!ecran) return;

    const reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

    function masquerEcran(delai) {
      setTimeout(() => {
        ecran.classList.add('loading-hide');
        setTimeout(() => ecran.remove(), 650);
      }, delai);
    }

    // La révélation (logo + ligne de balayage) est pilotée en CSS ;
    // ici on gère seulement la durée d'affichage et le repli sans animation.
    masquerEcran(reduceMotion ? 350 : 1700);
  })();

  // ============================================================
  // MATIÈRES — menu déroulant du formulaire de devis
  // ============================================================
  const selectMatiere = document.getElementById('matiere');
  const densiteInfo = document.getElementById('densite-info');
  const prixMatiereInput = document.getElementById('prix-matiere');

  function peuplerSelectDevis() {
    const donnees = chargerMateriaux();
    selectMatiere.innerHTML = '';
    Object.entries(donnees).forEach(([categorie, liste]) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = categorie;
      liste.forEach(mat => {
        const option = document.createElement('option');
        option.value = mat.code;
        option.textContent = mat.nom ? `${mat.code} — ${mat.nom}` : mat.code;
        option.dataset.densite = mat.densite ?? '';
        option.dataset.prix = mat.prixKg ?? '';
        optgroup.appendChild(option);
      });
      selectMatiere.appendChild(optgroup);
    });
    afficherInfosMatiereSelectionnee();
  }

  function afficherInfosMatiereSelectionnee() {
    const option = selectMatiere.selectedOptions[0];
    if (!option) return;
    const densite = option.dataset.densite;
    densiteInfo.textContent = densite
      ? `Densité indicative : ${densite} g/cm³`
      : '';
  }

  selectMatiere.addEventListener('change', () => {
    afficherInfosMatiereSelectionnee();
    const option = selectMatiere.selectedOptions[0];
    const prix = option?.dataset.prix;
    // Suggestion automatique du prix matière — l'utilisateur garde la main et peut l'ajuster.
    if (prix) prixMatiereInput.value = prix;
  });

  peuplerSelectDevis();

  // ============================================================
  // MATIÈRES — page de gestion (ajout / édition / suppression)
  // ============================================================
  const conteneurCategories = document.getElementById('categories-matieres');
  const selectNouvelleCategorie = document.getElementById('nouvelle-categorie-select');
  const champNouvelleCategorie = document.getElementById('champ-nouvelle-categorie');
  const inputNouvelleCategorieNom = document.getElementById('nouvelle-categorie-nom');

  function afficherPageMatieres() {
    const donnees = chargerMateriaux();

    // Tableaux par catégorie
    conteneurCategories.innerHTML = Object.entries(donnees).map(([categorie, liste]) => `
      <div class="categorie-bloc">
        <div class="categorie-header">
          <h3>${categorie}</h3>
          <button class="btn-supprimer-categorie" data-categorie="${categorie}">Supprimer la catégorie</button>
        </div>
        <table class="table-matieres">
          <thead>
            <tr><th>Désignation</th><th>Nom usuel</th><th>Densité (g/cm³)</th><th>Prix (€/kg)</th><th>Fournisseur</th><th>Réf. fournisseur</th><th></th></tr>
          </thead>
          <tbody>
            ${liste.map(mat => `
              <tr data-categorie="${categorie}" data-code="${mat.code}">
                <td>${mat.code}</td>
                <td>${mat.nom || ''}</td>
                <td><input type="number" step="0.01" min="0" class="input-densite" value="${mat.densite ?? ''}"></td>
                <td><input type="number" step="0.01" min="0" class="input-prix" value="${mat.prixKg ?? ''}"></td>
                <td><input type="text" class="input-fournisseur" value="${mat.fournisseur ?? ''}" placeholder="—"></td>
                <td><input type="text" class="input-ref-fournisseur" value="${mat.refFournisseur ?? ''}" placeholder="—"></td>
                <td><button class="btn-supprimer-matiere" title="Supprimer">✕</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('');

    // Menu déroulant "Catégorie" du formulaire d'ajout
    selectNouvelleCategorie.innerHTML = Object.keys(donnees)
      .map(cat => `<option value="${cat}">${cat}</option>`)
      .join('') + '<option value="__nouvelle__">+ Nouvelle catégorie…</option>';
  }

  selectNouvelleCategorie.addEventListener('change', () => {
    champNouvelleCategorie.style.display =
      selectNouvelleCategorie.value === '__nouvelle__' ? 'flex' : 'none';
  });

  // Édition en direct (densité / prix / fournisseur) via délégation d'événement
  conteneurCategories.addEventListener('change', (e) => {
    if (!e.target.matches('.input-densite, .input-prix, .input-fournisseur, .input-ref-fournisseur')) return;
    const ligne = e.target.closest('tr');
    const { categorie, code } = ligne.dataset;
    let champ, valeur;
    if (e.target.classList.contains('input-densite')) { champ = 'densite'; valeur = Number(e.target.value) || null; }
    else if (e.target.classList.contains('input-prix')) { champ = 'prixKg'; valeur = Number(e.target.value) || null; }
    else if (e.target.classList.contains('input-fournisseur')) { champ = 'fournisseur'; valeur = e.target.value.trim(); }
    else { champ = 'refFournisseur'; valeur = e.target.value.trim(); }
    modifierMateriau(categorie, code, { [champ]: valeur });
    peuplerSelectDevis(); // répercute la modif dans le formulaire de devis
  });

  // Suppression d'une matière
  conteneurCategories.addEventListener('click', (e) => {
    if (!e.target.matches('.btn-supprimer-matiere')) return;
    const ligne = e.target.closest('tr');
    const { categorie, code } = ligne.dataset;
    if (!confirm(`Supprimer la matière "${code}" ?`)) return;
    supprimerMateriau(categorie, code);
    afficherPageMatieres();
    peuplerSelectDevis();
  });

  // Suppression d'une catégorie entière
  conteneurCategories.addEventListener('click', (e) => {
    if (!e.target.matches('.btn-supprimer-categorie')) return;
    const categorie = e.target.dataset.categorie;
    if (!confirm(`Supprimer toute la catégorie "${categorie}" et ses matières ?`)) return;
    supprimerCategorieMatiere(categorie);
    afficherPageMatieres();
    peuplerSelectDevis();
  });

  // Ajout d'une matière (et éventuellement d'une nouvelle catégorie)
  document.getElementById('btn-ajouter-matiere').addEventListener('click', () => {
    let categorie = selectNouvelleCategorie.value;
    const code = document.getElementById('nouvelle-matiere-code').value.trim();
    const nom = document.getElementById('nouvelle-matiere-nom').value.trim();
    const densite = Number(document.getElementById('nouvelle-matiere-densite').value) || null;
    const prixKg = Number(document.getElementById('nouvelle-matiere-prix').value) || null;
    const fournisseur = document.getElementById('nouvelle-matiere-fournisseur').value.trim();
    const refFournisseur = document.getElementById('nouvelle-matiere-ref-fournisseur').value.trim();

    if (!code) {
      alert('La désignation de la matière est obligatoire.');
      return;
    }

    if (categorie === '__nouvelle__') {
      categorie = inputNouvelleCategorieNom.value.trim();
      if (!categorie) {
        alert('Indique un nom pour la nouvelle catégorie.');
        return;
      }
      ajouterCategorieMatiere(categorie);
    }

    ajouterMateriau(categorie, { code, nom, densite, prixKg, fournisseur, refFournisseur });

    // Réinitialisation du formulaire d'ajout
    document.getElementById('nouvelle-matiere-code').value = '';
    document.getElementById('nouvelle-matiere-nom').value = '';
    document.getElementById('nouvelle-matiere-densite').value = '';
    document.getElementById('nouvelle-matiere-prix').value = '';
    document.getElementById('nouvelle-matiere-fournisseur').value = '';
    document.getElementById('nouvelle-matiere-ref-fournisseur').value = '';
    inputNouvelleCategorieNom.value = '';
    champNouvelleCategorie.style.display = 'none';

    afficherPageMatieres();
    peuplerSelectDevis();
  });

  // ============================================================
  // NAVIGATION ENTRE VUES
  // ============================================================
  const navButtons = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  function allerVersVue(nomVue) {
    navButtons.forEach(b => b.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));

    document.querySelector(`.nav-btn[data-view="${nomVue}"]`)?.classList.add('active');
    document.getElementById(`view-${nomVue}`)?.classList.add('active');

    if (nomVue === 'historique') afficherHistorique();
    if (nomVue === 'matieres') afficherPageMatieres();
    if (nomVue === 'clients') afficherClients();
    if (nomVue === 'devis') { peuplerSelectDevis(); peuplerSelectClientDevis(); peuplerDatalistReferences(); }
    if (nomVue === 'parametres') afficherPreferences();
  }

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => allerVersVue(btn.dataset.view));
  });

  // Liens discrets vers une autre vue (ex : "Gérer mes clients" depuis le formulaire de devis)
  document.querySelectorAll('[data-view-link]').forEach(lien => {
    lien.addEventListener('click', () => allerVersVue(lien.dataset.viewLink));
  });

  // ============================================================
  // ACCUEIL
  // ============================================================
  document.getElementById('btn-accueil-nouveau-devis').addEventListener('click', () => allerVersVue('devis'));
  document.getElementById('btn-accueil-devis-existant').addEventListener('click', () => allerVersVue('historique'));

  // ============================================================
  // FORMULAIRE DE DEVIS
  // ============================================================
  const form = document.getElementById('form-devis');
  const prixTotalEl = document.getElementById('prix-total');

  // ---------- Opérations (liste répétable) ----------
  const listeOperationsEl = document.getElementById('liste-operations');

  function ligneOperationHTML() {
    return `
      <div class="ligne-repetable">
        <select class="op-type">
          <option value="usinage">Usinage</option>
          <option value="tolerie">Tôlerie</option>
          <option value="soudure">Soudure</option>
        </select>
        <input type="number" class="op-temps" placeholder="Temps (min)" min="0">
        <input type="number" class="op-taux" placeholder="Taux horaire (€/h)" min="0">
        <button type="button" class="btn-supprimer-ligne" aria-label="Supprimer cette opération">✕</button>
      </div>`;
  }

  function ajouterLigneOperation() {
    listeOperationsEl.insertAdjacentHTML('beforeend', ligneOperationHTML());
  }

  document.getElementById('btn-ajouter-operation').addEventListener('click', ajouterLigneOperation);
  ajouterLigneOperation(); // une ligne par défaut

  function lireOperations() {
    return [...listeOperationsEl.querySelectorAll('.ligne-repetable')].map(ligne => ({
      type: ligne.querySelector('.op-type').value,
      tempsMin: ligne.querySelector('.op-temps').value,
      tauxHoraire: ligne.querySelector('.op-taux').value
    }));
  }

  // ---------- Sous-traitance externe (liste répétable) ----------
  const listeSousTraitanceEl = document.getElementById('liste-sous-traitance');

  function ligneSousTraitanceHTML() {
    return `
      <div class="ligne-repetable">
        <input type="text" class="st-libelle" placeholder="ex : Anodisation">
        <input type="number" class="st-montant" placeholder="Montant (€)" min="0">
        <button type="button" class="btn-supprimer-ligne" aria-label="Supprimer cette ligne">✕</button>
      </div>`;
  }

  document.getElementById('btn-ajouter-sous-traitance').addEventListener('click', () => {
    listeSousTraitanceEl.insertAdjacentHTML('beforeend', ligneSousTraitanceHTML());
  });

  function lireSousTraitance() {
    return [...listeSousTraitanceEl.querySelectorAll('.ligne-repetable')].map(ligne => ({
      libelle: ligne.querySelector('.st-libelle').value,
      montant: ligne.querySelector('.st-montant').value
    }));
  }

  // Suppression d'une ligne répétable (opération ou sous-traitance), délégation sur le formulaire
  form.addEventListener('click', (e) => {
    if (!e.target.matches('.btn-supprimer-ligne')) return;
    e.target.closest('.ligne-repetable').remove();
  });

  // ---------- Frais fixes ----------
  function lireFraisFixes() {
    const frais = [];
    const transportCheck = document.getElementById('frais-transport-check');
    const emballageCheck = document.getElementById('frais-emballage-check');
    if (transportCheck.checked) {
      frais.push({ libelle: 'Transport', montant: document.getElementById('frais-transport-montant').value });
    }
    if (emballageCheck.checked) {
      frais.push({ libelle: 'Emballage', montant: document.getElementById('frais-emballage-montant').value });
    }
    return frais;
  }

  // Pré-remplissage des montants de frais fixes avec les préférences enregistrées
  function preremplirFraisFixesDepuisPreferences() {
    const prefs = chargerPreferences();
    document.getElementById('frais-transport-montant').value = prefs.fraisTransport;
    document.getElementById('frais-emballage-montant').value = prefs.fraisEmballage;
  }
  preremplirFraisFixesDepuisPreferences();

  function animerPrix(el, valeurCible) {
    const reduceMotion = window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    if (reduceMotion) {
      el.textContent = formaterPrix(valeurCible);
      el.dataset.valeur = valeurCible;
      return;
    }

    const valeurDepart = Number(el.dataset.valeur) || 0;
    const duree = 500;
    const debut = performance.now();

    function etape(maintenant) {
      const progression = Math.min((maintenant - debut) / duree, 1);
      // easing léger pour un rendu plus naturel qu'une interpolation linéaire
      const facile = 1 - Math.pow(1 - progression, 3);
      const valeurActuelle = valeurDepart + (valeurCible - valeurDepart) * facile;
      el.textContent = formaterPrix(valeurActuelle);
      if (progression < 1) {
        requestAnimationFrame(etape);
      } else {
        el.dataset.valeur = valeurCible;
      }
    }
    requestAnimationFrame(etape);
  }

  function lireFormulaire() {
    const data = new FormData(form);
    const selectClient = document.getElementById('client-select');
    const client = selectClient.value === '__nouveau__'
      ? document.getElementById('nouveau-client-nom-devis').value.trim()
      : selectClient.value;
    return {
      client,
      reference: document.getElementById('reference-piece').value.trim(),
      matiere: data.get('matiere'),
      epaisseur: data.get('epaisseur'),
      quantite: data.get('quantite'),
      poids: data.get('poids'),
      prixMatiere: data.get('prixMatiere'),
      pertePct: data.get('pertePct'),
      operations: lireOperations(),
      tempsReglageMin: document.getElementById('temps-reglage').value,
      tauxReglageHoraire: document.getElementById('taux-reglage').value,
      sousTraitance: lireSousTraitance(),
      fraisFixes: lireFraisFixes(),
      marge: data.get('marge')
    };
  }

  let dernierDetail = null;

  function calculerEtAfficher() {
    const donnees = lireFormulaire();
    const detail = calculerDevis(donnees);
    dernierDetail = detail;
    animerPrix(prixTotalEl, detail.prixTotal);
    return { donnees, total: detail.prixTotal, detail };
  }

  document.getElementById('btn-calculer').addEventListener('click', calculerEtAfficher);

  document.getElementById('btn-enregistrer').addEventListener('click', () => {
    const { donnees, total } = calculerEtAfficher();

    if (!donnees.client) {
      alert('Choisis un client ou indique le nom du nouveau client avant d\'enregistrer.');
      return;
    }

    sauvegarderDevis({ ...donnees, prixTotal: total });

    // Un nom de client saisi qui n'existe pas encore devient automatiquement un client
    // (fiche minimale, à compléter plus tard depuis la page Clients).
    if (!trouverClientParNom(donnees.client)) {
      ajouterClient({ nom: donnees.client, type: document.getElementById('nouveau-client-type-devis').value });
    }
    peuplerSelectClientDevis(donnees.client);
    peuplerDatalistReferences();

    alert('Devis enregistré dans l\'historique.');
  });

  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    const { donnees, detail } = calculerEtAfficher();
    genererPdfDevis(donnees, detail);
  });

  // ---------- Comparer avec d'autres matières ----------
  const blocComparaisonMatieres = document.getElementById('bloc-comparaison-matieres');
  const listeMatieresComparaisonEl = document.getElementById('liste-matieres-comparaison');

  document.getElementById('btn-toggle-comparaison-matieres').addEventListener('click', () => {
    const visible = blocComparaisonMatieres.style.display === 'block';
    blocComparaisonMatieres.style.display = visible ? 'none' : 'block';
    if (!visible) {
      const toutes = chargerMateriaux();
      listeMatieresComparaisonEl.innerHTML = Object.entries(toutes).flatMap(([cat, liste]) =>
        liste.map(m => `<label class="case-ligne"><input type="checkbox" value="${m.code}" data-prix="${m.prixKg ?? 0}"> ${m.code} (${m.prixKg ?? '—'} €/kg)</label>`)
      ).join('');
    }
  });

  document.getElementById('btn-comparer-matieres').addEventListener('click', () => {
    const donnees = lireFormulaire();
    const cases = [...listeMatieresComparaisonEl.querySelectorAll('input:checked')];
    if (cases.length === 0) {
      document.getElementById('resultat-comparaison-matieres').innerHTML = '<p class="empty-state">Coche au moins une matière à comparer.</p>';
      return;
    }
    const lignes = cases.map(c => {
      const detail = calculerDevis(donnees, { matiereOverride: { prixMatiere: c.dataset.prix } });
      return `<div class="ligne-comparaison"><span>${c.value}</span><span>${formaterPrix(detail.prixTotal)}</span></div>`;
    }).join('');
    document.getElementById('resultat-comparaison-matieres').innerHTML = lignes;
  });

  // ---------- Comparer par palier de quantité ----------
  const blocPaliers = document.getElementById('bloc-paliers');

  document.getElementById('btn-toggle-paliers').addEventListener('click', () => {
    blocPaliers.style.display = blocPaliers.style.display === 'block' ? 'none' : 'block';
  });

  document.getElementById('btn-comparer-paliers').addEventListener('click', () => {
    const donnees = lireFormulaire();
    const quantites = document.getElementById('paliers-quantites').value
      .split(',')
      .map(v => Number(v.trim()))
      .filter(v => v > 0);

    if (quantites.length === 0) {
      document.getElementById('resultat-paliers').innerHTML = '<p class="empty-state">Indique au moins une quantité valide.</p>';
      return;
    }

    const lignes = quantites.map(q => {
      const detail = calculerDevis(donnees, { quantiteOverride: q });
      return `<div class="ligne-comparaison"><span>${q} pièce${q > 1 ? 's' : ''}</span><span>${formaterPrix(detail.prixUnitaire)} / pièce — total ${formaterPrix(detail.prixTotal)}</span></div>`;
    }).join('');
    document.getElementById('resultat-paliers').innerHTML = lignes;
  });

  // ---------- Référence pièce : autocomplétion depuis l'historique ----------
  function peuplerDatalistReferences() {
    const references = [...new Set(chargerDevis().map(d => d.reference).filter(Boolean))];
    document.getElementById('references-datalist').innerHTML =
      references.map(r => `<option value="${r}"></option>`).join('');
  }
  peuplerDatalistReferences();

  // ============================================================
  // CLIENTS — choix / création dans le formulaire de devis + page de gestion
  // ============================================================
  const selectClientDevis = document.getElementById('client-select');
  const champNouveauClientDevis = document.getElementById('champ-nouveau-client-devis');
  const inputNouveauClientDevisNom = document.getElementById('nouveau-client-nom-devis');

  function peuplerSelectClientDevis(nomAConserver) {
    const clients = chargerClients();
    const valeurActuelle = nomAConserver
      || (selectClientDevis.value !== '__nouveau__' ? selectClientDevis.value : null);

    selectClientDevis.innerHTML = clients
      .map(c => `<option value="${c.nom}">${c.nom}</option>`)
      .join('') + '<option value="__nouveau__">+ Nouveau client…</option>';

    if (clients.length === 0) {
      // Aucun client encore connu : on démarre directement en mode création.
      selectClientDevis.value = '__nouveau__';
    } else if (valeurActuelle && clients.some(c => c.nom === valeurActuelle)) {
      selectClientDevis.value = valeurActuelle;
    } else {
      selectClientDevis.value = clients[0].nom;
    }

    champNouveauClientDevis.style.display = selectClientDevis.value === '__nouveau__' ? 'flex' : 'none';
    if (selectClientDevis.value !== '__nouveau__') {
      inputNouveauClientDevisNom.value = '';
    }
  }
  peuplerSelectClientDevis();

  const inputMarge = document.getElementById('marge');
  // (appliquerMargeSelonClient est appelée juste après sa définition, plus bas)

  function margeParDefautPourType(type) {
    const prefs = chargerPreferences();
    if (type === 'pro') return prefs.margePro;
    if (type === 'gros-compte') return prefs.margeGrosCompte;
    return prefs.margeParticulier;
  }

  function appliquerMargeSelonClient() {
    if (selectClientDevis.value === '__nouveau__') {
      inputMarge.value = margeParDefautPourType(document.getElementById('nouveau-client-type-devis').value);
    } else {
      const client = chargerClients().find(c => c.nom === selectClientDevis.value);
      inputMarge.value = margeParDefautPourType(client?.type);
    }
  }

  selectClientDevis.addEventListener('change', () => {
    champNouveauClientDevis.style.display = selectClientDevis.value === '__nouveau__' ? 'flex' : 'none';
    if (selectClientDevis.value === '__nouveau__') {
      inputNouveauClientDevisNom.focus();
    }
    appliquerMargeSelonClient();
  });

  document.getElementById('nouveau-client-type-devis').addEventListener('change', appliquerMargeSelonClient);
  appliquerMargeSelonClient();

  const listeClientsEl = document.getElementById('liste-clients');
  const inputClientId = document.getElementById('client-id-edition');
  const inputClientNom = document.getElementById('nouveau-client-nom');
  const inputClientType = document.getElementById('nouveau-client-type');
  const inputClientEmail = document.getElementById('nouveau-client-email');
  const inputClientTel = document.getElementById('nouveau-client-telephone');
  const inputClientAdresse = document.getElementById('nouveau-client-adresse');
  const inputClientNotes = document.getElementById('nouveau-client-notes');
  const titreFormClient = document.getElementById('titre-form-client');
  const btnAnnulerEditionClient = document.getElementById('btn-annuler-edition-client');

  function reinitialiserFormClient() {
    inputClientId.value = '';
    inputClientNom.value = '';
    inputClientType.value = 'particulier';
    inputClientEmail.value = '';
    inputClientTel.value = '';
    inputClientAdresse.value = '';
    inputClientNotes.value = '';
    titreFormClient.textContent = 'Ajouter un client';
    btnAnnulerEditionClient.style.display = 'none';
  }

  function afficherClients() {
    const liste = chargerClients();

    if (liste.length === 0) {
      listeClientsEl.innerHTML = '<p class="empty-state">Aucun client pour l\'instant — il en apparaîtra un dès ton premier devis enregistré, ou ajoute-en un ci-dessous.</p>';
      return;
    }

    listeClientsEl.innerHTML = liste.map(c => `
      <div class="client-item" data-id="${c.id}">
        <div class="client-item-info">
          <strong>${c.nom}</strong>
          <span class="badge-type-client">${{particulier:'Particulier', pro:'Pro', 'gros-compte':'Gros compte'}[c.type] || 'Particulier'}</span>
          ${[c.email, c.telephone].filter(Boolean).join(' · ') ? `<br><small>${[c.email, c.telephone].filter(Boolean).join(' · ')}</small>` : ''}
          ${c.adresse ? `<br><small>${c.adresse}</small>` : ''}
          ${c.notes ? `<br><small>${c.notes}</small>` : ''}
        </div>
        <div class="client-item-actions">
          <button class="btn-modifier-client">Modifier</button>
          <button class="btn-supprimer-client">Supprimer</button>
        </div>
      </div>
    `).join('');
  }

  listeClientsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.client-item');
    if (!item) return;
    const { id } = item.dataset;

    if (e.target.matches('.btn-modifier-client')) {
      const client = chargerClients().find(c => c.id === id);
      if (!client) return;
      inputClientId.value = client.id;
      inputClientNom.value = client.nom;
      inputClientType.value = client.type || 'particulier';
      inputClientEmail.value = client.email || '';
      inputClientTel.value = client.telephone || '';
      inputClientAdresse.value = client.adresse || '';
      inputClientNotes.value = client.notes || '';
      titreFormClient.textContent = `Modifier ${client.nom}`;
      btnAnnulerEditionClient.style.display = 'inline-block';
    }

    if (e.target.matches('.btn-supprimer-client')) {
      const client = chargerClients().find(c => c.id === id);
      if (!confirm(`Supprimer le client "${client?.nom}" ? (les devis déjà enregistrés ne sont pas supprimés)`)) return;
      supprimerClient(id);
      afficherClients();
      peuplerSelectClientDevis();
      if (inputClientId.value === id) reinitialiserFormClient();
    }
  });

  btnAnnulerEditionClient.addEventListener('click', reinitialiserFormClient);

  document.getElementById('btn-enregistrer-client').addEventListener('click', () => {
    const nom = inputClientNom.value.trim();
    if (!nom) {
      alert('Le nom du client est obligatoire.');
      return;
    }
    const champs = {
      nom,
      type: inputClientType.value,
      email: inputClientEmail.value.trim(),
      telephone: inputClientTel.value.trim(),
      adresse: inputClientAdresse.value.trim(),
      notes: inputClientNotes.value.trim()
    };

    if (inputClientId.value) {
      modifierClient(inputClientId.value, champs);
    } else {
      ajouterClient(champs);
    }

    reinitialiserFormClient();
    afficherClients();
    peuplerSelectClientDevis();
  });

  // ============================================================
  // HISTORIQUE
  // ============================================================
  function afficherHistorique() {
    const conteneur = document.getElementById('liste-historique');
    const recherche = (document.getElementById('recherche-historique').value || '').trim().toLowerCase();
    let liste = chargerDevis();

    if (recherche) {
      liste = liste.filter(d =>
        (d.client || '').toLowerCase().includes(recherche) ||
        (d.reference || '').toLowerCase().includes(recherche)
      );
    }

    if (liste.length === 0) {
      conteneur.innerHTML = '<p class="empty-state">Aucun devis trouvé.</p>';
      return;
    }

    conteneur.innerHTML = liste.map(devis => `
      <div class="devis-item" data-id="${devis.id}">
        <div class="devis-item-info">
          <strong>${devis.client || 'Client non renseigné'}</strong>
          ${devis.reference ? ` <span class="badge-reference">${devis.reference}</span>` : ''}
          — ${devis.matiere}, qté ${devis.quantite}
          — ${formaterPrix(devis.prixTotal)}
          <br><small>${new Date(devis.date).toLocaleString('fr-FR')}</small>
        </div>
        <button class="btn-supprimer-devis" title="Supprimer ce devis">✕</button>
      </div>
    `).join('');
  }

  document.getElementById('recherche-historique').addEventListener('input', afficherHistorique);

  // ============================================================
  // PARAMÈTRES — préférences (marges par défaut, frais fixes par défaut)
  // ============================================================
  function afficherPreferences() {
    const prefs = chargerPreferences();
    document.getElementById('pref-marge-particulier').value = prefs.margeParticulier;
    document.getElementById('pref-marge-pro').value = prefs.margePro;
    document.getElementById('pref-marge-gros-compte').value = prefs.margeGrosCompte;
    document.getElementById('pref-frais-transport').value = prefs.fraisTransport;
    document.getElementById('pref-frais-emballage').value = prefs.fraisEmballage;
  }
  afficherPreferences();

  document.getElementById('btn-enregistrer-preferences').addEventListener('click', () => {
    sauvegarderPreferences({
      margeParticulier: Number(document.getElementById('pref-marge-particulier').value) || 0,
      margePro: Number(document.getElementById('pref-marge-pro').value) || 0,
      margeGrosCompte: Number(document.getElementById('pref-marge-gros-compte').value) || 0,
      fraisTransport: Number(document.getElementById('pref-frais-transport').value) || 0,
      fraisEmballage: Number(document.getElementById('pref-frais-emballage').value) || 0
    });
    preremplirFraisFixesDepuisPreferences();
    alert('Préférences enregistrées.');
  });

  document.getElementById('liste-historique').addEventListener('click', (e) => {
    if (!e.target.matches('.btn-supprimer-devis')) return;
    const item = e.target.closest('.devis-item');
    const { id } = item.dataset;
    if (!confirm('Supprimer définitivement ce devis de l\'historique ?')) return;
    supprimerDevis(Number(id));
    afficherHistorique();
  });

});
