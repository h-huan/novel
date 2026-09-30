const fs = require('fs');

const decode = value => Buffer.from(value, 'base64').toString('utf8');
const replaceOnce = (text, from, to, label) => {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 anchor, found ${count}`);
  return text.replace(from, to);
};
const replaceRegexOnce = (text, regex, replacement, label) => {
  const matches = text.match(new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g')) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly 1 match, found ${matches.length}`);
  return text.replace(regex, replacement);
};
const replaceAllRequired = (text, from, to, countExpected, label) => {
  const count = text.split(from).length - 1;
  if (count !== countExpected) throw new Error(`${label}: expected ${countExpected} anchors, found ${count}`);
  return text.split(from).join(to);
};

const PRESELECTION = decode('ICAgICAgY29uc3QgcHJlbWlzZVBvb2xTaXplID0gTWF0aC5tYXgocmVxdWVzdGVkQ291bnQgKiAzLCByZXF1ZXN0ZWRDb3VudCArIDUpOwogICAgICBjb25zdCBidWlsZFByZW1pc2VTZWxlY3Rpb25Qcm9tcHQgPSAoKSA9PiB7CiAgICAgICAgY29uc3QgZXhjbHVkZVRleHQgPSBpbml0aWFsRXhjbHVkZXMubGVuZ3RoCiAgICAgICAgICA/IGBcbuOAkOWOhuWPsuS9nOWTgeS4juacrOasoeaYjuehruaOkumZpOmimOadkOOAkeS7peS4i+mimOadkOeahOagh+mimOOAgeiBjOS4mi/nlJ/mtLvovb3kvZPjgIHlhbPns7vnu5PmnoTjgIHmoLjlv4PmnLrliLbjgIHov73mn6Xot6/lvoTlkozlhbPplK7lj43ovazlnYfkuI3lvpfmjaLlkI3lpI3nlKjvvJpcbiR7aW5pdGlhbEV4Y2x1ZGVzLm1hcCgoaXRlbSwgaW5kZXgpID0+IGAke2luZGV4ICsgMX0uICR7aXRlbS50aXRsZX0ke2l0ZW0uaG9vayA/IGDvvZwke2l0ZW0uaG9va31gIDogJyd9JHtpdGVtLmRlc2NyaXB0aW9uID8gYO+9nCR7U3RyaW5nKGl0ZW0uZGVzY3JpcHRpb24pLnNsaWNlKDAsIDE4MCl9YCA6ICcnfWApLmpvaW4oJ1xuJyl9YAogICAgICAgICAgOiAnJzsKICAgICAgICBjb25zdCBjYXRlZ29yeVJlc29sdXRpb24gPSByZXNvbHZlU3VibWlzc2lvbkNhdGVnb3J5KGR0by5wbGF0Zm9ybSwgU3RyaW5nKGR0by5zdG9yeUNhdGVnb3J5IHx8ICcnKSwgZHRvLnN0b3J5VHlwZSwgYXVkaWVuY2VDaGFubmVsSGludChkdG8udGFyZ2V0QXVkaWVuY2UpKTsKICAgICAgICBjb25zdCBjYXRlZ29yeVdyaXRpbmdCcmllZiA9IGNhdGVnb3J5UmVzb2x1dGlvbi5zdGF0dXMgPT09ICdyZXNvbHZlZCcKICAgICAgICAgID8gcGxhdGZvcm1DYXRlZ29yeVdyaXRpbmdCcmllZihkdG8ucGxhdGZvcm0sIGNhdGVnb3J5UmVzb2x1dGlvbi52YWx1ZSwgZHRvLnN0b3J5VHlwZSkKICAgICAgICAgIDogJyc7CiAgICAgICAgY29uc3QgY2F0ZWdvcnlCZW5jaG1hcmsgPSBjYXRlZ29yeVJlc29sdXRpb24uc3RhdHVzID09PSAncmVzb2x2ZWQnCiAgICAgICAgICA/IHBsYXRmb3JtQ2F0ZWdvcnlCZW5jaG1hcmtOb3RlKGR0by5wbGF0Zm9ybSwgY2F0ZWdvcnlSZXNvbHV0aW9uLnZhbHVlLCBkdG8uc3RvcnlUeXBlKQogICAgICAgICAgOiAnJzsKICAgICAgICBjb25zdCBwcmVtaXNlU2NoZW1hID0gewogICAgICAgICAgcG9vbDogW3sKICAgICAgICAgICAgcHJlbWlzZUlkOiAnUDEnLAogICAgICAgICAgICB3b3JraW5nVGl0bGU6ICc0LTE25a2X5pqC5ZCNJywKICAgICAgICAgICAgcHJvdGFnb25pc3RTaXR1YXRpb246ICfkuLvop5LlvZPliY3nlJ/mtLvlpITlooPjgIHmg7PlrojkvY8v5b6X5YiwL+aUueWPmOS7gOS5iCcsCiAgICAgICAgICAgIG9wZW5pbmdFdmVudDogJ+ecn+ato+aUueWPmOS4u+inkuWRvei/kOeahOi1m+Wni+S6i+S7ticsCiAgICAgICAgICAgIGNvcmVDb25mbGljdDogJ+ebruagh+S4juS4u+WKqOWvueaJiy/njrDlrp7pmLvlipvlpoLkvZXlr7nmkp4nLAogICAgICAgICAgICBhY3RpdmVDaG9pY2U6ICfkuLvop5Llv4XpobvkurLoh6rlgZrlh7rnmoTlhbPplK7pgInmi6kv6KGM5YqoJywKICAgICAgICAgICAgZXNjYWxhdGlvbjogJ+mAieaLqeS5i+WQjuWmguS9lei/nue7reWNh+e6p+W5tuS6p+eUn+S4jeWPr+mAhuWQjuaenCcsCiAgICAgICAgICAgIHJldmVyc2FsRWZmZWN0OiAn5Y+N6L2s5aaC5L2V5pS55Y+Y55uu5qCH44CB5YWz57O744CB6IOc6LSf5p2h5Lu25oiW5Luj5Lu3JywKICAgICAgICAgICAgcGF5b2ZmOiAn5Lit5ZCO5q61L+e7iOWxgOWHhuWkh+WFkeeOsOeahOaguOW/g+mYheivu+aJv+ivuicsCiAgICAgICAgICAgIGlycmVwbGFjZWFibGVDYXJyaWVyOiAn5Li65LuA5LmI6L+Z5Liq6IGM5LiaL+eUn+a0u+i9veS9ky/lhbPns7vkuI3lj6/mm7/mjaInLAogICAgICAgICAgICBzZWNvbmRPcmRlckNvbnNlcXVlbmNlOiAn5py65Yi25ZCv5Yqo5ZCO6LCB6aKd5aSW5Y+X55uKL+WPl+aNn++8jOWFs+ezu+aIluebruagh+WmguS9leiiq+i/q+aUueWPmCcsCiAgICAgICAgICAgIHJlYWRlclF1ZXN0aW9uOiAn6K+76ICF55yL5a6M6LW35aeL5LqL5Lu25ZCO5b+F6aG76L+96Zeu55qE5YW35L2T6Zeu6aKYJywKICAgICAgICAgICAgZGlmZmVyZW50aWF0aW9uOiAn55u45a+55Y6G5Y+y6aKY5p2Q5ZKM5bi46KeB5aWX6Lev55yf5q2j5LiN5ZCM5Zyo5ZOq6YeMJywKICAgICAgICAgIH1dLAogICAgICAgICAgc2VsZWN0ZWRQcmVtaXNlSWRzOiBbJ1AxJ10sCiAgICAgICAgfTsKICAgICAgICByZXR1cm4gYCR7YnVpbGRQbGF0Zm9ybVN0eWxlRGlyZWN0aXZlKGR0by5wbGF0Zm9ybSwgZHRvLnN0b3J5VHlwZSwgZHRvLmN1c3RvbVBsYXRmb3JtTm90ZSl9CiR7aWRlYVByZW1pc2VTZWxlY3Rpb25EaXJlY3RpdmUoZHRvLnN0b3J5VHlwZSwgcmVxdWVzdGVkQ291bnQsIHByZW1pc2VQb29sU2l6ZSl9CuOAkOacrOasoeaJp+ihjOiuvuWumuOAkQrnm67moIflubPlj7A9JHtkdG8ucGxhdGZvcm1977yb5YiG57G7PSR7ZHRvLnN0b3J5Q2F0ZWdvcnl977yb5Yib5L2c5rWB5rS+PSR7ZHRvLndlYk5vdmVsR2VucmUuam9pbign44CBJyl977yb5bmz5Y+w5L2c5ZOB5qCH562+PSR7ZHRvLnN1Ym1pc3Npb25UYWdzLmpvaW4oJ+OAgScpfe+8m+Wfuuiwgz0ke2R0by5zdG9yeVRvbmUuam9pbign44CBJyl977yb5paH6aOOPSR7ZHRvLndyaXRpbmdTdHlsZS5qb2luKCfjgIEnKX3vvJvop4bop5I9JHtkdG8ucG92fSR7ZHRvLnBsb3RUYWdzLmxlbmd0aCA/ICfvvJvmg4XoioLlj5blkJE9JyArIGR0by5wbG90VGFncy5qb2luKCfjgIEnKSA6ICcnfSR7ZHRvLmdlbnJlRml0Tm90ZSA/ICfvvJvmoIfnrb7kuI7liIbnsbvlpZHlkIjkvp3mja49JyArIGR0by5nZW5yZUZpdE5vdGUgOiAnJ33jgIIKJHtjYXRlZ29yeVdyaXRpbmdCcmllZiA/IGDjgJDliIbnsbvor4Hmja7jgJEke2NhdGVnb3J5V3JpdGluZ0JyaWVmfWAgOiAn5q2k5YiG57G75bCa5peg5bey5qC46aqM55qE5a6Y5pa55qCH562+77yM5LiN57yW6YCg5bmz5Y+w5qCH562+44CCJ30KJHtjYXRlZ29yeUJlbmNobWFyayA/IGDjgJDliIbnsbvkvZPph4/lj4LogIPjgJEke2NhdGVnb3J5QmVuY2htYXJrfWAgOiAnJ30KJHtjb25maWd1cmVkVGFyZ2V0V29yZHMgIT09IG51bGwgPyBg55So5oi35bey5oyH5a6a55uu5qCH5oC75a2X5pWwICR7Y29uZmlndXJlZFRhcmdldFdvcmRzfe+8m+etm+mAieaXtuW/hemhu+WIpOaWremimOadkOaYr+WQpuaSkeW+l+S9j+i/meS4gOS9k+mHj+OAgmAgOiAn55So5oi35pyq5oyH5a6a5oC75a2X5pWw77yb562b6YCJ5pe25oyJ5bmz5Y+w5YiG57G75L2T6YeP5ZKM5pWF5LqL6Ieq6Lqr5Y+v5oyB57ut5oCn5Yik5pat44CCJ30KJHtleGNsdWRlVGV4dH0K5Y+q6L6T5Ye65LiA5Liq5ZCI5rOVIEpTT04g5a+56LGh77yM5LiN6L6T5Ye6IE1hcmtkb3du44CB6K+E5YiG6KGo44CB5reY5rGw6L+H56iL5oiW5oCd6ICD6L+H56iL44CCCnBvb2wg5b+F6aG76Iez5bCRICR7cHJlbWlzZVBvb2xTaXplfSDpobnvvIxwcmVtaXNlSWQg5b+F6aG75ZSv5LiA77ybc2VsZWN0ZWRQcmVtaXNlSWRzIOW/hemhu+aBsOWlvSAke3JlcXVlc3RlZENvdW50fSDpobnjgIHkupLkuI3ph43lpI3vvIzlubbkuJTmr4/kuKogSUQg6YO95b+F6aG75p2l6IeqIHBvb2zjgIIKSlNPTiDnu5PmnoTvvJoke0pTT04uc3RyaW5naWZ5KHByZW1pc2VTY2hlbWEpfWA7CiAgICAgIH07CgogICAgICBjb25zdCBkaXNjb3ZlclByZW1pc2VQb29sQmVmb3JlQ2FyZHMgPSBhc3luYyAoKTogUHJvbWlzZTx7IHBvb2w6IGFueVtdOyBzZWxlY3RlZDogYW55W10gfT4gPT4gewogICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgdGhpcy5yZWFsTExNLmdlbmVyYXRlKHsKICAgICAgICAgIHByb21wdDogYnVpbGRQcmVtaXNlU2VsZWN0aW9uUHJvbXB0KCksCiAgICAgICAgICBzY2VuYXJpbzogJ2lkZWFfZ2VuZXJhdGUnLAogICAgICAgICAgdGltZW91dDogTExNX1RVTkFCTEVTLnRpbWVvdXRTaW1wbGUoKSwKICAgICAgICAgIG1heEVtcHR5UmV0cmllczogMSwKICAgICAgICAgIHJlc3BvbnNlRm9ybWF0OiAnanNvbl9vYmplY3QnLAogICAgICAgIH0pOwogICAgICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBTdHJpbmcocmVzcG9uc2UuY29udGVudCB8fCAnJykKICAgICAgICAgIC50cmltKCkKICAgICAgICAgIC5yZXBsYWNlKC9eYGBgKD86anNvbik/XHMqL2ksICcnKQogICAgICAgICAgLnJlcGxhY2UoL1xzKmBgYCQvaSwgJycpOwogICAgICAgIGxldCBwYXJzZWQ6IGFueTsKICAgICAgICB0cnkgewogICAgICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShqc29ucmVwYWlyKG5vcm1hbGl6ZWQgfHwgJ3t9JykpOwogICAgICAgIH0gY2F0Y2ggewogICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfliJvlu7rliY3popjmnZDnrZvpgInmnKrov5Tlm57lkIjms5UgSlNPTu+8m+ezu+e7n+ayoeacieWIm+W7uuS7u+S9leWujOaVtOmimOadkOWNoeOAgicpOwogICAgICAgIH0KICAgICAgICBjb25zdCBwb29sID0gQXJyYXkuaXNBcnJheShwYXJzZWQ/LnBvb2wpID8gcGFyc2VkLnBvb2wgOiBbXTsKICAgICAgICBjb25zdCBzZWxlY3RlZElkcyA9IEFycmF5LmlzQXJyYXkocGFyc2VkPy5zZWxlY3RlZFByZW1pc2VJZHMpCiAgICAgICAgICA/IHBhcnNlZC5zZWxlY3RlZFByZW1pc2VJZHMubWFwKChpdGVtOiB1bmtub3duKSA9PiBTdHJpbmcoaXRlbSB8fCAnJykudHJpbSgpKS5maWx0ZXIoQm9vbGVhbikKICAgICAgICAgIDogW107CiAgICAgICAgY29uc3QgcmVxdWlyZWRGaWVsZHMgPSBbCiAgICAgICAgICAncHJlbWlzZUlkJywgJ3dvcmtpbmdUaXRsZScsICdwcm90YWdvbmlzdFNpdHVhdGlvbicsICdvcGVuaW5nRXZlbnQnLCAnY29yZUNvbmZsaWN0JywKICAgICAgICAgICdhY3RpdmVDaG9pY2UnLCAnZXNjYWxhdGlvbicsICdyZXZlcnNhbEVmZmVjdCcsICdwYXlvZmYnLCAnaXJyZXBsYWNlYWJsZUNhcnJpZXInLAogICAgICAgICAgJ3NlY29uZE9yZGVyQ29uc2VxdWVuY2UnLCAncmVhZGVyUXVlc3Rpb24nLCAnZGlmZmVyZW50aWF0aW9uJywKICAgICAgICBdOwogICAgICAgIGNvbnN0IG1hbGZvcm1lZCA9IHBvb2wuZmluZCgoaXRlbTogYW55KSA9PgogICAgICAgICAgIWl0ZW0gfHwgcmVxdWlyZWRGaWVsZHMuc29tZShmaWVsZCA9PiBTdHJpbmcoaXRlbT8uW2ZpZWxkXSB8fCAnJykudHJpbSgpLmxlbmd0aCA8IDQpKTsKICAgICAgICBpZiAocG9vbC5sZW5ndGggPCBwcmVtaXNlUG9vbFNpemUgfHwgbWFsZm9ybWVkKSB7CiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYOWIm+W7uuWJjemimOadkOetm+mAieacquW9ouaIkOiHs+WwkSAke3ByZW1pc2VQb29sU2l6ZX0g5Liq57uT5p6E5a6M5pW055qE6L276YeP6aKY5p2Q6IOa5a2Q77yb57O757uf5rKh5pyJ5Yib5bu65a6M5pW06aKY5p2Q5Y2h77yM5Lmf5LiN5Lya55So5byx6aKY5p2Q6KGl5pWw44CCYCk7CiAgICAgICAgfQogICAgICAgIGNvbnN0IGJ5SWQgPSBuZXcgTWFwPHN0cmluZywgYW55PigpOwogICAgICAgIGZvciAoY29uc3QgaXRlbSBvZiBwb29sKSB7CiAgICAgICAgICBjb25zdCBpZCA9IFN0cmluZyhpdGVtPy5wcmVtaXNlSWQgfHwgJycpLnRyaW0oKTsKICAgICAgICAgIGlmICghaWQgfHwgYnlJZC5oYXMoaWQpKSB7CiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcign5Yib5bu65YmN6aKY5p2Q562b6YCJ6L+U5Zue5LqG6YeN5aSN5oiW56m655qEIHByZW1pc2VJZO+8m+ezu+e7n+ayoeacieWIm+W7uuWujOaVtOmimOadkOWNoeOAgicpOwogICAgICAgICAgfQogICAgICAgICAgYnlJZC5zZXQoaWQsIGl0ZW0pOwogICAgICAgIH0KICAgICAgICBpZiAoc2VsZWN0ZWRJZHMubGVuZ3RoICE9PSByZXF1ZXN0ZWRDb3VudCB8fCBuZXcgU2V0KHNlbGVjdGVkSWRzKS5zaXplICE9PSByZXF1ZXN0ZWRDb3VudCkgewogICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDliJvlu7rliY3popjmnZDnrZvpgInlv4Xpobvku47ovbvph4/lgJnpgInmsaDkuK3mmI7noa7pgInlh7ogJHtyZXF1ZXN0ZWRDb3VudH0g5Liq5oiQ54af6aKY5p2Q77yb5b2T5YmN6YCJ5oup5pWw6YeP5LiN56ym77yM57O757uf5LiN5Lya6L+b5YWl5a6M5pW06aKY5p2Q5Y2h5Yib5bu644CCYCk7CiAgICAgICAgfQogICAgICAgIGNvbnN0IHNlbGVjdGVkID0gc2VsZWN0ZWRJZHMubWFwKChpZDogc3RyaW5nKSA9PiBieUlkLmdldChpZCkpOwogICAgICAgIGlmIChzZWxlY3RlZC5zb21lKChpdGVtOiBhbnkpID0+ICFpdGVtKSkgewogICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCfliJvlu7rliY3popjmnZDnrZvpgInlvJXnlKjkuoblgJnpgInmsaDkuK3kuI3lrZjlnKjnmoQgcHJlbWlzZUlk77yb57O757uf5LiN5Lya6L+b5YWl5a6M5pW06aKY5p2Q5Y2h5Yib5bu644CCJyk7CiAgICAgICAgfQogICAgICAgIHJldHVybiB7IHBvb2wsIHNlbGVjdGVkIH07CiAgICAgIH07Cgo=');
const FINAL_FLOW = decode('ICAgICAgY29uc3QgcHJlbWlzZURpc2NvdmVyeSA9IGF3YWl0IGRpc2NvdmVyUHJlbWlzZVBvb2xCZWZvcmVDYXJkcygpOwogICAgICBjb25zdCBzZWxlY3RlZFByZW1pc2VzID0gcHJlbWlzZURpc2NvdmVyeS5zZWxlY3RlZDsKICAgICAgY29uc3Qgc2VsZWN0ZWRQcmVtaXNlSWRzID0gbmV3IFNldChzZWxlY3RlZFByZW1pc2VzLm1hcCgoaXRlbTogYW55KSA9PiBTdHJpbmcoaXRlbT8ucHJlbWlzZUlkIHx8ICcnKS50cmltKCkpKTsKICAgICAgY29uc3Qgc3RydWN0dXJlZENhcmRzID0gYXdhaXQgZ2VuZXJhdGVCYXRjaChyZXF1ZXN0ZWRDb3VudCwgaW5pdGlhbEV4Y2x1ZGVzLCBzZWxlY3RlZFByZW1pc2VzKTsKICAgICAgaWYgKHN0cnVjdHVyZWRDYXJkcy5sZW5ndGggIT09IHJlcXVlc3RlZENvdW50KSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlrozmlbTpopjmnZDljaHnu5PmnoTljJblupTkuI7liJvlu7rliY3nrZvpgInlh7rnmoQgJHtyZXF1ZXN0ZWRDb3VudH0g5Liq6aKY5p2Q5LiA5LiA5a+55bqU77yb5b2T5YmN5Y+q6L+U5ZueICR7c3RydWN0dXJlZENhcmRzLmxlbmd0aH0g5byg77yM57O757uf5LiN5Lya5Y+m5om+6aKY5p2Q6KGl5pWw44CCYCk7CiAgICAgIH0KICAgICAgY29uc3Qgc3RydWN0dXJlZFByZW1pc2VJZHMgPSBzdHJ1Y3R1cmVkQ2FyZHMubWFwKChpdGVtOiBhbnkpID0+IFN0cmluZyhpdGVtPy5zb3VyY2VQcmVtaXNlSWQgfHwgJycpLnRyaW0oKSk7CiAgICAgIGNvbnN0IHN0cnVjdHVyZWRVbmlxdWVJZHMgPSBuZXcgU2V0KHN0cnVjdHVyZWRQcmVtaXNlSWRzKTsKICAgICAgY29uc3QgbWlzc2luZ1ByZW1pc2VJZHMgPSBbLi4uc2VsZWN0ZWRQcmVtaXNlSWRzXS5maWx0ZXIoaWQgPT4gIXN0cnVjdHVyZWRVbmlxdWVJZHMuaGFzKGlkKSk7CiAgICAgIGNvbnN0IHVua25vd25QcmVtaXNlSWRzID0gWy4uLnN0cnVjdHVyZWRVbmlxdWVJZHNdLmZpbHRlcihpZCA9PiAhc2VsZWN0ZWRQcmVtaXNlSWRzLmhhcyhpZCkpOwogICAgICBpZiAoc3RydWN0dXJlZFVuaXF1ZUlkcy5zaXplICE9PSByZXF1ZXN0ZWRDb3VudCB8fCBtaXNzaW5nUHJlbWlzZUlkcy5sZW5ndGggfHwgdW5rbm93blByZW1pc2VJZHMubGVuZ3RoKSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGDlrozmlbTpopjmnZDljaHmsqHmnInpgJDkuIDkv53mjIHliJvlu7rliY3nrZvpgInnu5PmnpzvvJvnvLrlpLE9JHttaXNzaW5nUHJlbWlzZUlkcy5qb2luKCfjgIEnKSB8fCAn5pegJ33vvIzotornlYw9JHt1bmtub3duUHJlbWlzZUlkcy5qb2luKCfjgIEnKSB8fCAn5pegJ33jgILns7vnu5/kuI3kvJroh6rliqjmjaLpopjmiJbooaXnlJ/jgIJgKTsKICAgICAgfQogICAgICBhY2NlcHQoc3RydWN0dXJlZENhcmRzKTsKCiAgICAgIGNvbnN0IHNlbGVjdGVkQWNjZXB0ZWQgPSBhY2NlcHRlZA==');

const path = 'server/src/chain/chain.controller.ts';
let text = fs.readFileSync(path, 'utf8');
text = replaceOnce(text,
  "import { ideaHookRequirement, ideaRecoveryDirective } from './idea-discovery-contract';",
  "import { ideaCardStructuringDirective, ideaHookRequirement, ideaPremiseSelectionDirective } from './idea-discovery-contract';",
  'contract import');
text = replaceOnce(text,
  'const outputSchema = `{"ideas":[{"title":"4-16字标题"',
  'const outputSchema = `{"ideas":[{"sourcePremiseId":"P1","title":"4-16字标题"',
  'sourcePremiseId schema');
text = replaceOnce(text, '      const buildPrompt = (\n', PRESELECTION + '      const buildPrompt = (\n', 'insert preselection stage');
text = replaceAllRequired(text, '        recoveryReasons: string[] = [],\n', '        selectedPremises: any[] = [],\n', 2, 'rename recovery arguments');
text = replaceOnce(text,
  '        const recoveryText = ideaRecoveryDirective(dto.storyType, recoveryReasons, count);',
  '        const structureText = ideaCardStructuringDirective(selectedPremises);',
  'replace recovery directive');
text = replaceOnce(text, '${excludeText}${recoveryText}', '${excludeText}${structureText}', 'structure directive prompt');
text = replaceOnce(text, '          prompt: buildPrompt(count, excludes, recoveryReasons),', '          prompt: buildPrompt(count, excludes, selectedPremises),', 'generateBatch structuring input');
text = replaceOnce(text,
  '历史作品与本批已通过题材（标题、职业场景、异常机制、核心冲突、代价和反转均不得换名复用）',
  '历史作品与本次明确排除题材（标题、职业场景、异常机制、核心冲突、代价和反转均不得换名复用）',
  'exclude wording');
text = replaceOnce(text,
  '          // 唯一吸引力/留存 Gate 必须在这里执行：这里只有这一层同时掌握第一批失败原因和第二次补生。\n          // 旧链路在 HTTP adapter 再筛一次，外层失败无法反馈给补生 Prompt，形成“内层通过、外层全灭”。',
  '          // 最终吸引力/留存 Gate 只做独立验收：完整题材卡已经来自前置轻量候选池的明确筛选。\n          // 这里不得再承担主要选题、换题或质量补生；失败只进入审计并阻断该卡展示。',
  'gate responsibility');
text = replaceRegexOnce(text, /      const firstBatchCount =[\s\S]*?\n      const selectedAccepted = accepted/, FINAL_FLOW, 'remove recovery loop');
text = replaceOnce(text,
  "        schemaVersion: 3,\n        mode: 'single_recoverable_reader_experience_gate',\n        generated: candidateAssessments.length,",
  "        schemaVersion: 4,\n        mode: 'premise_preselection_then_final_reader_experience_gate',\n        premisePoolSize: premiseDiscovery.pool.length,\n        premiseSelected: selectedPremises.length,\n        generated: candidateAssessments.length,",
  'audit mode');
text = replaceOnce(text,
  '        reasons: uniqueRejectedReasons.slice(0, 8),\n        candidateAssessments,',
  '        reasons: uniqueRejectedReasons.slice(0, 8),\n        preselectedPremises: selectedPremises,\n        candidateAssessments,',
  'audit premises');
text = replaceOnce(text,
  "        note: '这是文本吸引力与读者体验前置 Gate，不是预测点击率/完读率；未通过候选只保留审计，不进入前端展示。',",
  "        note: '先完成轻量题材池的创建前筛选，再把已选胚子结构化为完整题材卡；最终 Gate 只做独立验收，不负责换题或补生。',",
  'audit note');
text = replaceRegexOnce(text,
  /      if \(!selectedAccepted\.length\) \{[\s\S]*?\n      \}\n      const acceptedWithAudit/,
  `      if (!selectedAccepted.length) {\n        const rejectionSummary = uniqueRejectedReasons.slice(0, 10).join('；') || '证据不足';\n        this.logger.warn(\`idea-discover: 创建前已筛选 \${selectedPremises.length} 个题材，但完整卡最终 Gate 全部拒绝：\${rejectionSummary}\`);\n        return {\n          success: false,\n          ideas: [],\n          totalIdeas: 0,\n          error: '创建前筛选已完成，但完整题材卡最终验收没有任何一项通过；系统已停止展示，不会通过增加补生次数或另换题材掩盖。请重新发现。',\n          appealGate,\n        };\n      }\n      const acceptedWithAudit`,
  'all rejected failure');
text = replaceOnce(text,
  '      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材，逻辑调用不超过2次`);',
  '      this.logger.log(`idea-discover: 完成 ${acceptedWithAudit.length}/${requestedCount} 个合格题材；创建前筛选与完整卡结构化已分阶段完成，最终 Gate 未参与补生`);',
  'completion log');
text = replaceOnce(text,
  '        qualityWarning: acceptedWithAudit.length < requestedCount\n          ? `本次有 ${acceptedWithAudit.length} 个题材通过展示 Gate；其余结果已淘汰，不用占位内容补数。`\n          : undefined,',
  '        qualityWarning: acceptedWithAudit.length < requestedCount\n          ? `创建前已筛选 ${selectedPremises.length} 个成熟题材；完整卡最终 Gate 有 ${acceptedWithAudit.length}/${requestedCount} 个通过。未通过项已留审计，系统没有自动补生或换题。`\n          : undefined,',
  'partial warning');

for (const forbidden of ['ideaRecoveryDirective', '最多补跑一次', '自动补生一次', '两轮候选均未通过']) {
  if (text.includes(forbidden)) throw new Error(`obsolete recovery marker remains: ${forbidden}`);
}
for (const required of ['discoverPremisePoolBeforeCards', 'selectedPremiseIds', 'ideaCardStructuringDirective(selectedPremises)', "mode: 'premise_preselection_then_final_reader_experience_gate'"]) {
  if (!text.includes(required)) throw new Error(`preselection marker missing: ${required}`);
}
fs.writeFileSync(path, text, 'utf8');
console.log('chain.controller.ts patched');
