/**
 * 收尾反转脱敏（单一事实源）
 *
 * 用途：把世界观档案 custom_settings 里命中「收尾反转」的条目改写为不含答案的提示，
 * 让正文生成侧拿不到收尾反转的答案（答案只留给评审侧），从结构上防止提前消费反转。
 *
 * 生成侧（chain.controller.buildEndingForeshadowGuard）与档案侧
 * （world-setting.service.sanitizeCustomSettings）共用本方法——此前两处各写一份同样的
 * 正则，任何一处调整都会让两端脱敏口径漂移，故收敛到这里唯一维护。
 */
export function maskForeshadowAnswers(text: string): string {
  return text
    .replace(/[（(][^）)]*?(?:沈|贺|郭|周|宁|简|石|殷|覃|祝|陶|龙|韦|莫|小满)[^）)]*[）)]/g, '（具体归属锁定在收尾揭示）')
    .replace(/笔迹[一二两0-9][^，。；\n]{0,16}?[属是为][^，。；\n（(]{0,10}/g, '笔迹（归属锁定在收尾揭示）')
    .replace(/[写签]着[“「]?[沈贺郭周宁简石殷覃祝陶龙韦莫][^”」]{0,8}/g, '写着（署名锁定在收尾揭示）')
    .replace(/为(?:沈|贺|郭|周|宁|简|石|殷|覃|祝|陶|龙|韦|莫)[^，。；\n]{0,12}/g, '（签保关系锁定在收尾揭示）');
}