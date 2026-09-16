/**
 * Ch1ffra — bibliothèque des matières PAR DÉFAUT
 * Désignations normalisées (NF EN) + densité indicative (g/cm³) + prix indicatif (€/kg).
 *
 * Ces valeurs ne sont qu'un POINT DE DÉPART : elles sont copiées dans le stockage local
 * (voir storage.js / chargerMateriaux) au premier lancement, puis l'utilisateur peut les
 * modifier, en ajouter ou en supprimer depuis la page "Matières" de l'app. Ce fichier n'est
 * plus relu ensuite, sauf réinitialisation volontaire.
 *
 * Prix indicatifs pour petites quantités (atelier), estimés à partir de prix moyens
 * observés courant 2026 chez des distributeurs/négociants français — à ajuster selon
 * tes propres fournisseurs, les prix réels variant fortement selon le format, la quantité
 * et les cours des matières premières (nickel, alu, pétrole pour les plastiques...).
 */

const MATERIAUX = {
  "Aciers non-alliés": [
    { code: "S235JR", nom: "Acier de construction courant", densite: 7.85, prixKg: 1.20 },
    { code: "S275JR", nom: "Acier de construction", densite: 7.85, prixKg: 1.30 },
    { code: "S355JR", nom: "Acier de construction haute résistance", densite: 7.85, prixKg: 1.50 },
    { code: "C45", nom: "Acier au carbone (ex XC48)", densite: 7.85, prixKg: 1.80 }
  ],
  "Aciers alliés / traités": [
    { code: "42CrMo4", nom: "Acier allié trempé-revenu (ex 42CD4)", densite: 7.85, prixKg: 2.50 },
    { code: "16MnCr5", nom: "Acier de cémentation (ex 16MC5)", densite: 7.85, prixKg: 2.30 }
  ],
  "Aciers inoxydables": [
    { code: "X5CrNi18-10", nom: "Inox austénitique 304", densite: 7.9, prixKg: 3.20 },
    { code: "X2CrNi19-11", nom: "Inox austénitique 304L", densite: 7.9, prixKg: 3.30 },
    { code: "X5CrNiMo17-12-2", nom: "Inox austénitique 316", densite: 8.0, prixKg: 5.20 },
    { code: "X2CrNiMo17-12-2", nom: "Inox austénitique 316L", densite: 8.0, prixKg: 5.30 },
    { code: "X6CrNiTi18-10", nom: "Inox austénitique stabilisé 321", densite: 7.9, prixKg: 5.80 },
    { code: "X2CrNiMoN17-13-5", nom: "Inox austénitique 317LN", densite: 8.0, prixKg: 7.50 },
    { code: "X20Cr13", nom: "Inox martensitique 420", densite: 7.7, prixKg: 3.50 }
  ],
  "Fontes": [
    { code: "EN-GJL-250", nom: "Fonte grise", densite: 7.2, prixKg: 2.00 },
    { code: "EN-GJS-400-15", nom: "Fonte ductile (sphéroïdale)", densite: 7.1, prixKg: 2.20 }
  ],
  "Aluminiums": [
    { code: "EN AW-2017A", nom: "Aluminium (ex AU4G)", densite: 2.79, prixKg: 5.50 },
    { code: "EN AW-5754", nom: "Aluminium (ex AlMg3)", densite: 2.67, prixKg: 4.50 },
    { code: "EN AW-6060", nom: "Aluminium (profilés)", densite: 2.70, prixKg: 4.00 },
    { code: "EN AW-6082", nom: "Aluminium (ex AlSiMgMn)", densite: 2.70, prixKg: 4.50 },
    { code: "EN AW-7075", nom: "Aluminium haute résistance", densite: 2.81, prixKg: 8.50 }
  ],
  "Plastiques techniques": [
    { code: "PTFE", nom: "Polytétrafluoroéthylène (Téflon)", densite: 2.2, prixKg: 20.00 },
    { code: "POM", nom: "Polyoxyméthylène (Delrin / Acétal)", densite: 1.41, prixKg: 5.00 },
    { code: "PE-HD", nom: "Polyéthylène haute densité", densite: 0.95, prixKg: 2.50 },
    { code: "PE-UHMW", nom: "Polyéthylène ultra haute masse molaire", densite: 0.94, prixKg: 4.50 },
    { code: "PA6", nom: "Polyamide 6 (Nylon)", densite: 1.14, prixKg: 5.50 },
    { code: "PA66", nom: "Polyamide 6.6 (Nylon)", densite: 1.15, prixKg: 6.00 },
    { code: "PEEK", nom: "Polyétheréthercétone", densite: 1.32, prixKg: 90.00 },
    { code: "PMMA", nom: "Polyméthacrylate de méthyle (Plexiglas)", densite: 1.18, prixKg: 5.00 },
    { code: "PC", nom: "Polycarbonate", densite: 1.20, prixKg: 5.50 },
    { code: "PVC", nom: "Polychlorure de vinyle", densite: 1.40, prixKg: 2.50 }
  ]
};
