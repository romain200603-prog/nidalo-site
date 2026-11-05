// Copie exacte de Packages/ImmoKit/Tests/InvestmentEngineTests/Fixtures/investment-cases.json : cas de référence
// partagés par l'app (InvestmentFixtureTests) et le site.

export type InvestmentCase = {
  name: string;
  inputs: {
    purchasePrice: string;
    monthlyRent: string;
    coOwnership?: string;
    recoverable?: string;
    propertyTax?: string;
    works?: string;
    furniture?: string;
    isNewBuild?: boolean;
  };
  assumptions: {
    notaryOld: string;
    notaryNew: string;
    bankFees: string;
    vacancy: string;
    management: string;
    maintenance: string;
    pno: string;
    downPayment: string | null;
    loanRate: string;
    months: number;
    insuranceRate: string;
  };
  expected: Record<string, string>;
};

export const INVESTMENT_CASES: InvestmentCase[] = [
  {
    "name": "T2 Lyon ancien, données complètes",
    "inputs": {
      "purchasePrice": "180000",
      "monthlyRent": "850",
      "coOwnership": "120",
      "recoverable": "60",
      "propertyTax": "900"
    },
    "assumptions": {
      "notaryOld": "0.075",
      "notaryNew": "0.025",
      "bankFees": "0",
      "vacancy": "0.04",
      "management": "0",
      "maintenance": "0",
      "pno": "150",
      "downPayment": null,
      "loanRate": "0.035",
      "months": 240,
      "insuranceRate": "0.003"
    },
    "expected": {
      "notaryFees": "13500.00",
      "totalProjectCost": "193500.00",
      "loanAmount": "180000.00",
      "monthlyLoanPayment": "1043.93",
      "monthlyLoanInsurance": "45.00",
      "annualCollectedRent": "9792.00",
      "annualOperatingExpenses": "1770.00",
      "grossYield": "0.0567",
      "netYield": "0.0415",
      "monthlyCashFlow": "-420.43"
    }
  },
  {
    "name": "Studio avec travaux et apport 20k",
    "inputs": {
      "purchasePrice": "95000",
      "monthlyRent": "560",
      "coOwnership": "80",
      "recoverable": "40",
      "propertyTax": "550",
      "works": "15000",
      "furniture": "4000"
    },
    "assumptions": {
      "notaryOld": "0.075",
      "notaryNew": "0.025",
      "bankFees": "0",
      "vacancy": "0.04",
      "management": "0",
      "maintenance": "0",
      "pno": "150",
      "downPayment": "20000",
      "loanRate": "0.035",
      "months": 240,
      "insuranceRate": "0.003"
    },
    "expected": {
      "notaryFees": "7125.00",
      "totalProjectCost": "121125.00",
      "loanAmount": "101125.00",
      "monthlyLoanPayment": "586.48",
      "monthlyLoanInsurance": "25.28",
      "annualCollectedRent": "6451.20",
      "annualOperatingExpenses": "1180.00",
      "grossYield": "0.0707",
      "netYield": "0.0435",
      "monthlyCashFlow": "-172.49"
    }
  },
  {
    "name": "Maison neuve sans copro, taxe estimée",
    "inputs": {
      "purchasePrice": "250000",
      "monthlyRent": "1300",
      "isNewBuild": true
    },
    "assumptions": {
      "notaryOld": "0.075",
      "notaryNew": "0.025",
      "bankFees": "0",
      "vacancy": "0.04",
      "management": "0",
      "maintenance": "0",
      "pno": "150",
      "downPayment": null,
      "loanRate": "0.032",
      "months": 300,
      "insuranceRate": "0.003"
    },
    "expected": {
      "notaryFees": "6250.00",
      "totalProjectCost": "256250.00",
      "loanAmount": "250000.00",
      "monthlyLoanPayment": "1211.70",
      "monthlyLoanInsurance": "62.50",
      "annualCollectedRent": "14976.00",
      "annualOperatingExpenses": "1450.00",
      "grossYield": "0.0624",
      "netYield": "0.0528",
      "monthlyCashFlow": "-147.03"
    }
  },
  {
    "name": "Achat comptant avec gestion agence",
    "inputs": {
      "purchasePrice": "120000",
      "monthlyRent": "700",
      "coOwnership": "100",
      "propertyTax": "700"
    },
    "assumptions": {
      "notaryOld": "0.075",
      "notaryNew": "0.025",
      "bankFees": "0",
      "vacancy": "0.04",
      "management": "0.07",
      "maintenance": "0.02",
      "pno": "150",
      "downPayment": "200000",
      "loanRate": "0.035",
      "months": 240,
      "insuranceRate": "0.003"
    },
    "expected": {
      "notaryFees": "9000.00",
      "totalProjectCost": "129000.00",
      "loanAmount": "0.00",
      "monthlyLoanPayment": "0.00",
      "monthlyLoanInsurance": "0.00",
      "annualCollectedRent": "8064.00",
      "annualOperatingExpenses": "2775.76",
      "grossYield": "0.0700",
      "netYield": "0.0410",
      "monthlyCashFlow": "440.69"
    }
  },
  {
    "name": "Taux zéro",
    "inputs": {
      "purchasePrice": "100000",
      "monthlyRent": "600",
      "coOwnership": "50",
      "recoverable": "50",
      "propertyTax": "600"
    },
    "assumptions": {
      "notaryOld": "0.075",
      "notaryNew": "0.025",
      "bankFees": "0",
      "vacancy": "0.04",
      "management": "0",
      "maintenance": "0",
      "pno": "150",
      "downPayment": null,
      "loanRate": "0",
      "months": 120,
      "insuranceRate": "0.003"
    },
    "expected": {
      "notaryFees": "7500.00",
      "totalProjectCost": "107500.00",
      "loanAmount": "100000.00",
      "monthlyLoanPayment": "833.33",
      "monthlyLoanInsurance": "25.00",
      "annualCollectedRent": "6912.00",
      "annualOperatingExpenses": "750.00",
      "grossYield": "0.0720",
      "netYield": "0.0573",
      "monthlyCashFlow": "-344.83"
    }
  }
];
