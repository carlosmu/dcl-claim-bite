import { setupUi } from './ui'
import { setupMineProximity } from './mining/mine-proximity'

export function main() {
    setupMineProximity()
    setupUi()
}
