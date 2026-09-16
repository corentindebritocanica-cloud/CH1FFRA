/**
 * Ch1ffra — module de calcul
 * Formule V1 (simple, ajustable) :
 *   prix = (temps_estime_h * taux_horaire) + (poids * prix_matiere)
 *   prix_avec_marge = prix * (1 + marge / 100)
 *   prix_total = prix_avec_marge * quantite
 */

function calculerPrixUnitaire({ tempsEstimeMin, tauxHoraire, poids, prixMatiere, marge }) {
  const tempsEstimeH = (Number(tempsEstimeMin) || 0) / 60;
  const coutTemps = tempsEstimeH * (Number(tauxHoraire) || 0);
  const coutMatiere = (Number(poids) || 0) * (Number(prixMatiere) || 0);
  const coutBrut = coutTemps + coutMatiere;
  const coutAvecMarge = coutBrut * (1 + (Number(marge) || 0) / 100);

  return {
    coutTemps,
    coutMatiere,
    coutBrut,
    coutAvecMarge
  };
}

function calculerPrixTotal(donnees) {
  const { coutAvecMarge } = calculerPrixUnitaire(donnees);
  const quantite = Number(donnees.quantite) || 1;
  return coutAvecMarge * quantite;
}

function formaterPrix(valeur) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(valeur);
}
