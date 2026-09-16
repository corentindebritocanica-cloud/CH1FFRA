/**
 * Ch1ffra — app.js
 * Câblage de l'interface : navigation, formulaire de devis, historique, gestion des matières.
 * L'export PDF (bouton présent, non branché) sera ajouté avec jsPDF dans une étape suivante.
 */

document.addEventListener('DOMContentLoaded', () => {

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
            <tr><th>Désignation</th><th>Nom usuel</th><th>Densité (g/cm³)</th><th>Prix (€/kg)</th><th></th></tr>
          </thead>
          <tbody>
            ${liste.map(mat => `
              <tr data-categorie="${categorie}" data-code="${mat.code}">
                <td>${mat.code}</td>
                <td>${mat.nom || ''}</td>
                <td><input type="number" step="0.01" min="0" class="input-densite" value="${mat.densite ?? ''}"></td>
                <td><input type="number" step="0.01" min="0" class="input-prix" value="${mat.prixKg ?? ''}"></td>
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

  // Édition en direct (densité / prix) via délégation d'événement
  conteneurCategories.addEventListener('change', (e) => {
    if (!e.target.matches('.input-densite, .input-prix')) return;
    const ligne = e.target.closest('tr');
    const { categorie, code } = ligne.dataset;
    const champ = e.target.classList.contains('input-densite') ? 'densite' : 'prixKg';
    modifierMateriau(categorie, code, { [champ]: Number(e.target.value) || null });
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

    ajouterMateriau(categorie, { code, nom, densite, prixKg });

    // Réinitialisation du formulaire d'ajout
    document.getElementById('nouvelle-matiere-code').value = '';
    document.getElementById('nouvelle-matiere-nom').value = '';
    document.getElementById('nouvelle-matiere-densite').value = '';
    document.getElementById('nouvelle-matiere-prix').value = '';
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
    if (nomVue === 'devis') peuplerSelectDevis();
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
    return {
      client: data.get('client') || '',
      matiere: data.get('matiere'),
      epaisseur: data.get('epaisseur'),
      quantite: data.get('quantite'),
      operation: data.get('operation'),
      tempsEstimeMin: data.get('tempsEstime'),
      tauxHoraire: data.get('tauxHoraire'),
      prixMatiere: data.get('prixMatiere'),
      poids: data.get('poids'),
      marge: data.get('marge')
    };
  }

  function calculerEtAfficher() {
    const donnees = lireFormulaire();
    const total = calculerPrixTotal(donnees);
    animerPrix(prixTotalEl, total);
    return { donnees, total };
  }

  document.getElementById('btn-calculer').addEventListener('click', calculerEtAfficher);

  document.getElementById('btn-enregistrer').addEventListener('click', () => {
    const { donnees, total } = calculerEtAfficher();
    sauvegarderDevis({ ...donnees, prixTotal: total });

    // Un nom de client saisi qui n'existe pas encore devient automatiquement un client
    // (fiche minimale, à compléter plus tard depuis la page Clients).
    if (donnees.client && !trouverClientParNom(donnees.client)) {
      ajouterClient({ nom: donnees.client });
      peuplerDatalistClients();
    }

    alert('Devis enregistré dans l\'historique.');
  });

  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    alert('Export PDF : à venir (bibliothèque jsPDF pas encore branchée).');
  });

  // ============================================================
  // CLIENTS — autocomplete sur le formulaire de devis + page de gestion
  // ============================================================
  function peuplerDatalistClients() {
    const datalist = document.getElementById('clients-datalist');
    datalist.innerHTML = chargerClients()
      .map(c => `<option value="${c.nom}"></option>`)
      .join('');
  }
  peuplerDatalistClients();

  const listeClientsEl = document.getElementById('liste-clients');
  const inputClientId = document.getElementById('client-id-edition');
  const inputClientNom = document.getElementById('nouveau-client-nom');
  const inputClientEmail = document.getElementById('nouveau-client-email');
  const inputClientTel = document.getElementById('nouveau-client-telephone');
  const inputClientAdresse = document.getElementById('nouveau-client-adresse');
  const inputClientNotes = document.getElementById('nouveau-client-notes');
  const titreFormClient = document.getElementById('titre-form-client');
  const btnAnnulerEditionClient = document.getElementById('btn-annuler-edition-client');

  function reinitialiserFormClient() {
    inputClientId.value = '';
    inputClientNom.value = '';
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
      peuplerDatalistClients();
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
    peuplerDatalistClients();
  });

  // ============================================================
  // HISTORIQUE
  // ============================================================
  function afficherHistorique() {
    const conteneur = document.getElementById('liste-historique');
    const liste = chargerDevis();

    if (liste.length === 0) {
      conteneur.innerHTML = '<p class="empty-state">Aucun devis enregistré pour l\'instant.</p>';
      return;
    }

    conteneur.innerHTML = liste.map(devis => `
      <div class="devis-item" data-id="${devis.id}">
        <div class="devis-item-info">
          <strong>${devis.client || 'Client non renseigné'}</strong>
          — ${devis.matiere}, ${devis.operation}, qté ${devis.quantite}
          — ${formaterPrix(devis.prixTotal)}
          <br><small>${new Date(devis.date).toLocaleString('fr-FR')}</small>
        </div>
        <button class="btn-supprimer-devis" title="Supprimer ce devis">✕</button>
      </div>
    `).join('');
  }

  document.getElementById('liste-historique').addEventListener('click', (e) => {
    if (!e.target.matches('.btn-supprimer-devis')) return;
    const item = e.target.closest('.devis-item');
    const { id } = item.dataset;
    if (!confirm('Supprimer définitivement ce devis de l\'historique ?')) return;
    supprimerDevis(Number(id));
    afficherHistorique();
  });

});
