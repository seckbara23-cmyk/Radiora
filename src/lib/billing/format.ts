// Shared XOF (CFA franc) formatting for billing surfaces.
export function formatXof(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.round(amount)) + ' FCFA'
}
