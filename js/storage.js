/**
 * Ch1ffra — module de stockage
 * V1 : localStorage uniquement (pas de Firebase pour l'instant, voir README section 5bis).
 */

const STORAGE_KEY = 'ch1ffra_devis';

function chargerDevis() {
  const brut = localStorage.getItem(STORAGE_KEY);
  if (!brut) return [];
  try {
    return JSON.parse(brut);
  } catch (e) {
    console.error('Historique corrompu, réinitialisation.', e);
    return [];
  }
}

function sauvegarderDevis(devis) {
  const liste = chargerDevis();
  liste.unshift({
    ...devis,
    id: Date.now(),
    date: new Date().toISOString()
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(liste));
  return liste;
}

function supprimerDevis(id) {
  const liste = chargerDevis().filter(d => d.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(liste));
  return liste;
}

/**
 * Bibliothèque de matières — copie modifiable en localStorage.
 * Au premier lancement, on copie les valeurs par défaut de MATERIAUX (js/materiaux.js).
 * Ensuite, cette copie locale est la seule source de vérité : l'utilisateur peut modifier
 * densité/prix, ajouter des matières, créer ou supprimer des catégories depuis la page Matières.
 */

const STORAGE_KEY_MATERIAUX = 'ch1ffra_materiaux';

function chargerMateriaux() {
  const brut = localStorage.getItem(STORAGE_KEY_MATERIAUX);
  if (brut) {
    try {
      return JSON.parse(brut);
    } catch (e) {
      console.error('Bibliothèque de matières corrompue, réinitialisation depuis les valeurs par défaut.', e);
    }
  }
  const seed = JSON.parse(JSON.stringify(MATERIAUX));
  localStorage.setItem(STORAGE_KEY_MATERIAUX, JSON.stringify(seed));
  return seed;
}

function sauvegarderMateriaux(donnees) {
  localStorage.setItem(STORAGE_KEY_MATERIAUX, JSON.stringify(donnees));
}

function ajouterCategorieMatiere(nomCategorie) {
  const donnees = chargerMateriaux();
  if (!donnees[nomCategorie]) {
    donnees[nomCategorie] = [];
    sauvegarderMateriaux(donnees);
  }
  return donnees;
}

function supprimerCategorieMatiere(nomCategorie) {
  const donnees = chargerMateriaux();
  delete donnees[nomCategorie];
  sauvegarderMateriaux(donnees);
  return donnees;
}

function ajouterMateriau(nomCategorie, materiau) {
  const donnees = chargerMateriaux();
  if (!donnees[nomCategorie]) donnees[nomCategorie] = [];
  donnees[nomCategorie].push(materiau);
  sauvegarderMateriaux(donnees);
  return donnees;
}

function modifierMateriau(nomCategorie, code, champs) {
  const donnees = chargerMateriaux();
  const liste = donnees[nomCategorie] || [];
  const mat = liste.find(m => m.code === code);
  if (mat) Object.assign(mat, champs);
  sauvegarderMateriaux(donnees);
  return donnees;
}

function supprimerMateriau(nomCategorie, code) {
  const donnees = chargerMateriaux();
  if (donnees[nomCategorie]) {
    donnees[nomCategorie] = donnees[nomCategorie].filter(m => m.code !== code);
  }
  sauvegarderMateriaux(donnees);
  return donnees;
}
