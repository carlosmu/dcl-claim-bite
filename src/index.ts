import { setupUi } from './ui'
import { setupMineProximity } from './mining/mine-proximity'
import { setupBank } from './bank/bank'

export function main() {
    setupMineProximity()
    setupBank()
    setupUi()
}
