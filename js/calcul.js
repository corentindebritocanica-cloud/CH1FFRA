/**
 * Ch1ffra — module de calcul
 *
 * Formule V2 :
 *   cout_operations_piece = somme( temps_operation_h * taux_horaire_operation )
 *   cout_matiere_piece     = poids * prix_matiere * (1 + perte% / 100)
 *   cout_sous_traitance_piece = somme( montants sous-traitance )
 *   cout_reglage (une fois, pas par piece) = temps_reglage_h * taux_horaire_reglage
 *
 *   cout_brut_piece   = cout_operations_piece + cout_matiere_piece + cout_sous_traitance_piece
 *   cout_avec_marge   = (cout_reglage + cout_brut_piece * quantite) * (1 + marge% / 100)
 *   prix_total        = cout_avec_marge + frais_fixes (frais fixes hors marge, une fois)
 */

function calculerCoutOperations(operations) {
  return (operations || []).reduce((total, op) => {
    const h = (Number(op.tempsMin) || 0) / 60;
    return total + h * (Number(op.tauxHoraire) || 0);
  }, 0);
}

function calculerCoutMatierePiece({ poids, prixMatiere, pertePct }) {
  const base = (Number(poids) || 0) * (Number(prixMatiere) || 0);
  return base * (1 + (Number(pertePct) || 0) / 100);
}

function calculerCoutListe(liste) {
  return (liste || []).reduce((total, item) => total + (Number(item.montant) || 0), 0);
}

function calculerCoutReglage({ tempsReglageMin, tauxReglageHoraire }) {
  const h = (Number(tempsReglageMin) || 0) / 60;
  return h * (Number(tauxReglageHoraire) || 0);
}

/**
 * Calcule le détail complet d'un devis. `donnees` peut contenir :
 * operations[], sousTraitance[], fraisFixes[] (uniquement les cochés),
 * poids, prixMatiere, pertePct, tempsReglageMin, tauxReglageHoraire, marge, quantite.
 * `quantiteOverride` permet de recalculer pour une autre quantité (paliers).
 * `matiereOverride` permet de recalculer avec un autre { prixMatiere } (comparaison matières).
 */
function calculerDevis(donnees, { quantiteOverride, matiereOverride } = {}) {
  const quantite = Number(quantiteOverride ?? donnees.quantite) || 1;
  const prixMatiere = matiereOverride?.prixMatiere ?? donnees.prixMatiere;

  const coutOperationsPiece = calculerCoutOperations(donnees.operations);
  const coutMatierePiece = calculerCoutMatierePiece({
    poids: donnees.poids,
    prixMatiere,
    pertePct: donnees.pertePct
  });
  const coutSousTraitancePiece = calculerCoutListe(donnees.sousTraitance);
  const coutReglage = calculerCoutReglage(donnees);

  const coutBrutPiece = coutOperationsPiece + coutMatierePiece + coutSousTraitancePiece;
  const marge = 1 + (Number(donnees.marge) || 0) / 100;
  const coutAvecMarge = (coutReglage + coutBrutPiece * quantite) * marge;

  const fraisFixesTotal = calculerCoutListe(donnees.fraisFixes);
  const prixTotal = coutAvecMarge + fraisFixesTotal;

  return {
    coutOperationsPiece,
    coutMatierePiece,
    coutSousTraitancePiece,
    coutReglage,
    coutBrutPiece,
    fraisFixesTotal,
    prixTotal,
    prixUnitaire: quantite > 0 ? prixTotal / quantite : prixTotal
  };
}

function calculerPrixTotal(donnees) {
  return calculerDevis(donnees).prixTotal;
}

function formaterPrix(valeur) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR'
  }).format(valeur);
}
