/**
 * Ch1ffra — app.js
 * Câblage de l'interface : navigation entre vues, formulaire de devis, historique.
 * L'export PDF (bouton présent, non branché) sera ajouté avec jsPDF dans une étape suivante.
 */

document.addEventListener('DOMContentLoaded', () => {

  // --- Navigation entre vues ---
  const navButtons = document.querySelectorAll('.nav-btn');
  const views = document.querySelectorAll('.view');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(`view-${btn.dataset.view}`).classList.add('active');

      if (btn.dataset.view === 'historique') {
        afficherHistorique();
      }
    });
  });

  // --- Formulaire de devis ---
  const form = document.getElementById('form-devis');
  const prixTotalEl = document.getElementById('prix-total');

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
    prixTotalEl.textContent = formaterPrix(total);
    return { donnees, total };
  }

  document.getElementById('btn-calculer').addEventListener('click', calculerEtAfficher);

  document.getElementById('btn-enregistrer').addEventListener('click', () => {
    const { donnees, total } = calculerEtAfficher();
    sauvegarderDevis({ ...donnees, prixTotal: total });
    alert('Devis enregistré dans l\'historique.');
  });

  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    alert('Export PDF : à venir (bibliothèque jsPDF pas encore branchée).');
  });

  // --- Historique ---
  function afficherHistorique() {
    const conteneur = document.getElementById('liste-historique');
    const liste = chargerDevis();

    if (liste.length === 0) {
      conteneur.innerHTML = '<p class="empty-state">Aucun devis enregistré pour l\'instant.</p>';
      return;
    }

    conteneur.innerHTML = liste.map(devis => `
      <div class="devis-item">
        <strong>${devis.client || 'Client non renseigné'}</strong>
        — ${devis.matiere}, ${devis.operation}, qté ${devis.quantite}
        — ${formaterPrix(devis.prixTotal)}
        <br><small>${new Date(devis.date).toLocaleString('fr-FR')}</small>
      </div>
    `).join('');
  }

});
