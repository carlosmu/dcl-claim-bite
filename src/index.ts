import { setupUi } from './ui'
import { setupMineProximity } from './mining/mine-proximity'
import { setupBank } from './bank/bank'
import { setupShop } from './shop/shop'
import { setupMusic } from './world/music'

export function main() {
    setupMusic()
    setupMineProximity()
    setupBank()
    setupShop()
    setupUi()
}
