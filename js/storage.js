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

/**
 * Clients — liste modifiable en localStorage.
 * Se remplit automatiquement au fil des devis (voir app.js : enregistrer un devis
 * avec un nom de client inconnu crée le client), et peut aussi être gérée à la main
 * depuis la page "Clients" (ajout, édition, suppression).
 */

const STORAGE_KEY_CLIENTS = 'ch1ffra_clients';

function chargerClients() {
  const brut = localStorage.getItem(STORAGE_KEY_CLIENTS);
  if (!brut) return [];
  try {
    return JSON.parse(brut);
  } catch (e) {
    console.error('Liste des clients corrompue, réinitialisation.', e);
    return [];
  }
}

function sauvegarderClientsListe(liste) {
  localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(liste));
  return liste;
}

function trouverClientParNom(nom) {
  const nomNormalise = (nom || '').trim().toLowerCase();
  if (!nomNormalise) return null;
  return chargerClients().find(c => c.nom.trim().toLowerCase() === nomNormalise) || null;
}

function ajouterClient(client) {
  const liste = chargerClients();
  const nouveau = {
    id: 'client_' + Date.now(),
    nom: (client.nom || '').trim(),
    type: client.type || 'particulier',
    email: client.email || '',
    telephone: client.telephone || '',
    adresse: client.adresse || '',
    notes: client.notes || ''
  };
  liste.push(nouveau);
  sauvegarderClientsListe(liste);
  return nouveau;
}

function modifierClient(id, champs) {
  const liste = chargerClients().map(c => c.id === id ? { ...c, ...champs } : c);
  sauvegarderClientsListe(liste);
  return liste;
}

function supprimerClient(id) {
  const liste = chargerClients().filter(c => c.id !== id);
  sauvegarderClientsListe(liste);
  return liste;
}

/**
 * Préférences — valeurs par défaut réutilisées dans les devis :
 * marge par type de client, montants par défaut des frais fixes.
 */

const STORAGE_KEY_PREFERENCES = 'ch1ffra_preferences';

const PREFERENCES_PAR_DEFAUT = {
  margeParticulier: 25,
  margePro: 20,
  margeGrosCompte: 12,
  fraisTransport: 15,
  fraisEmballage: 5
};

function chargerPreferences() {
  const brut = localStorage.getItem(STORAGE_KEY_PREFERENCES);
  if (!brut) return { ...PREFERENCES_PAR_DEFAUT };
  try {
    return { ...PREFERENCES_PAR_DEFAUT, ...JSON.parse(brut) };
  } catch (e) {
    console.error('Préférences corrompues, réinitialisation.', e);
    return { ...PREFERENCES_PAR_DEFAUT };
  }
}

function sauvegarderPreferences(champs) {
  const actuelles = chargerPreferences();
  const fusion = { ...actuelles, ...champs };
  localStorage.setItem(STORAGE_KEY_PREFERENCES, JSON.stringify(fusion));
  return fusion;
}
