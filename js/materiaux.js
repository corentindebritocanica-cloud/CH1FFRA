/**
 * Ch1ffra — bibliothèque des matières
 * Désignations normalisées (NF EN) + densité indicative (g/cm³), utile pour :
 *  - aider l'utilisateur à vérifier le poids saisi manuellement (V1)
 *  - calculer automatiquement le poids une fois le parsing STEP branché (V2, voir README section 5bis)
 *
 * Liste volontairement large mais pas exhaustive — à compléter au fil des besoins réels des ateliers.
 */

const MATERIAUX = {
  "Aciers non-alliés": [
    { code: "S235JR", nom: "Acier de construction courant", densite: 7.85 },
    { code: "S275JR", nom: "Acier de construction", densite: 7.85 },
    { code: "S355JR", nom: "Acier de construction haute résistance", densite: 7.85 },
    { code: "C45", nom: "Acier au carbone (ex XC48)", densite: 7.85 }
  ],
  "Aciers alliés / traités": [
    { code: "42CrMo4", nom: "Acier allié trempé-revenu (ex 42CD4)", densite: 7.85 },
    { code: "16MnCr5", nom: "Acier de cémentation (ex 16MC5)", densite: 7.85 }
  ],
  "Aciers inoxydables": [
    { code: "X5CrNi18-10", nom: "Inox austénitique 304", densite: 7.9 },
    { code: "X2CrNi19-11", nom: "Inox austénitique 304L", densite: 7.9 },
    { code: "X5CrNiMo17-12-2", nom: "Inox austénitique 316", densite: 8.0 },
    { code: "X2CrNiMo17-12-2", nom: "Inox austénitique 316L", densite: 8.0 },
    { code: "X6CrNiTi18-10", nom: "Inox austénitique stabilisé 321", densite: 7.9 },
    { code: "X2CrNiMoN17-13-5", nom: "Inox austénitique 317LN", densite: 8.0 },
    { code: "X20Cr13", nom: "Inox martensitique 420", densite: 7.7 }
  ],
  "Fontes": [
    { code: "EN-GJL-250", nom: "Fonte grise", densite: 7.2 },
    { code: "EN-GJS-400-15", nom: "Fonte ductile (sphéroïdale)", densite: 7.1 }
  ],
  "Aluminiums": [
    { code: "EN AW-2017A", nom: "Aluminium (ex AU4G)", densite: 2.79 },
    { code: "EN AW-5754", nom: "Aluminium (ex AlMg3)", densite: 2.67 },
    { code: "EN AW-6060", nom: "Aluminium (profilés)", densite: 2.70 },
    { code: "EN AW-6082", nom: "Aluminium (ex AlSiMgMn)", densite: 2.70 },
    { code: "EN AW-7075", nom: "Aluminium haute résistance", densite: 2.81 }
  ],
  "Plastiques techniques": [
    { code: "PTFE", nom: "Polytétrafluoroéthylène (Téflon)", densite: 2.2 },
    { code: "POM", nom: "Polyoxyméthylène (Delrin / Acétal)", densite: 1.41 },
    { code: "PE-HD", nom: "Polyéthylène haute densité", densite: 0.95 },
    { code: "PE-UHMW", nom: "Polyéthylène ultra haute masse molaire", densite: 0.94 },
    { code: "PA6", nom: "Polyamide 6 (Nylon)", densite: 1.14 },
    { code: "PA66", nom: "Polyamide 6.6 (Nylon)", densite: 1.15 },
    { code: "PEEK", nom: "Polyétheréthercétone", densite: 1.32 },
    { code: "PMMA", nom: "Polyméthacrylate de méthyle (Plexiglas)", densite: 1.18 },
    { code: "PC", nom: "Polycarbonate", densite: 1.20 },
    { code: "PVC", nom: "Polychlorure de vinyle", densite: 1.40 }
  ],
  "Autre": [
    { code: "autre", nom: "Autre matière (à préciser)", densite: null }
  ]
};
