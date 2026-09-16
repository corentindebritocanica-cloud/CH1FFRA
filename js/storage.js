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
