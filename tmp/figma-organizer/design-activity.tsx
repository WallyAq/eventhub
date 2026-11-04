const assetPathPrefix = "https://www.figma.com/api/mcp/asset/58583604-8e26-4d6c-bd9c-7bb312659eea";
const imgContainer = `${assetPathPrefix}/95ba4.svg`;
const imgContainer1 = `${assetPathPrefix}/31e39.svg`;
const imgContainer2 = `${assetPathPrefix}/83cdb.svg`;
const imgContainer3 = `${assetPathPrefix}/d8fc6.svg`;
const imgIcon = `${assetPathPrefix}/82d43.svg`;
const imgIcon1 = `${assetPathPrefix}/665c6.svg`;
const imgImage = `${assetPathPrefix}/b5bd9.svg`;
const imgContainer4 = `${assetPathPrefix}/3b42a.svg`;

export default function CriarSubevento() {
  return (
    <div className="backdrop-blur-[4px] bg-[rgba(41,48,64,0.4)] content-stretch flex items-center justify-center px-[24px] relative size-full" data-node-id="2053:2589" data-name="Criar Subevento">
      <div className="bg-white border border-[#c7c4d8] border-solid h-[1204px] max-w-[800px] overflow-x-clip overflow-y-auto relative rounded-[8px] shadow-[0px_25px_50px_-12px_rgba(0,0,0,0.25)] shrink-0 w-[800px]" data-node-id="2053:2590" data-name="Container Principal do Modal / Gaveta Suave">
        <div className="absolute content-stretch flex flex-col gap-[32px] items-start left-0 p-[24px] right-0 top-[113px]" data-node-id="2053:2591" data-name="Conteúdo do Formulário (Scrollável com barra sutil)">
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" data-node-id="2053:2592" data-name="Section - SEÇÃO 1: Informações da Atividade">
            <div className="border-[rgba(199,196,216,0.5)] border-b border-solid content-stretch flex items-center pb-[5px] relative shrink-0 w-full" data-node-id="2053:2593" data-name="HorizontalBorder">
              <div className="relative shrink-0" data-node-id="2053:2596" data-name="Heading 3">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[16px] whitespace-nowrap" data-node-id="2053:2597">
                    <p className="leading-[24px]">1. Informações da Atividade</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" data-node-id="2053:2598" data-name="Container">
              <div className="content-stretch flex flex-col gap-[6px] items-start relative shrink-0 w-full" data-node-id="2053:2599" data-name="Nome da atividade">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2600" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2601">
                    <p>
                      <span className="leading-[20px]">Nome da atividade</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2602" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2603" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-auto relative rounded-[inherit] size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2604">
                        <p className="leading-[24px]">Workshop Prático de Visão Computacional</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[8px] items-start relative shrink-0 w-full" data-node-id="2053:2605" data-name="Tipo (Pills Selector)">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2606" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2607">
                    <p>
                      <span className="leading-[20px]">Tipo de atividade</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex gap-[10px] items-start justify-center relative shrink-0 w-full" data-node-id="2053:2608" data-name="Radiogroup - Tipo de atividade">
                  <div className="bg-[#f9f9ff] border border-[#c7c4d8] border-solid content-stretch flex flex-[1_0_0] gap-[8px] items-center justify-center min-w-px px-[13px] py-[11px] relative rounded-[4px]" data-node-id="2053:2609" data-name="Label - Opção Curso">
                    <div className="h-[13.5px] relative shrink-0 w-[16.5px]" data-node-id="2053:2610" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer} />
                    </div>
                    <div className="relative shrink-0" data-node-id="2053:2612" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[14px] whitespace-nowrap" data-node-id="2053:2613">
                          <p className="leading-[20px]">Curso</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#f9f9ff] border border-[#c7c4d8] border-solid content-stretch flex flex-[1_0_0] gap-[8px] items-center justify-center min-w-px px-[13px] py-[11px] relative rounded-[4px]" data-node-id="2053:2614" data-name="Label - Opção Minicurso">
                    <div className="h-[12px] relative shrink-0 w-[15px]" data-node-id="2053:2615" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer1} />
                    </div>
                    <div className="relative shrink-0" data-node-id="2053:2617" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[14px] whitespace-nowrap" data-node-id="2053:2618">
                          <p className="leading-[20px]">Minicurso</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#e9edff] border border-[#4f46e5] border-solid content-stretch flex flex-[1_0_0] gap-[8px] items-center justify-center min-w-px px-[13px] py-[11px] relative rounded-[4px]" data-node-id="2053:2619" data-name="Label - Opção Workshop (Selecionado por padrão)">
                    <div className="h-[12px] relative shrink-0 w-[15px]" data-node-id="2053:2620" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer2} />
                    </div>
                    <div className="relative shrink-0" data-node-id="2053:2622" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#3525cd] text-[14px] whitespace-nowrap" data-node-id="2053:2623">
                          <p className="leading-[20px]">Workshop</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="bg-[#f9f9ff] border border-[#c7c4d8] border-solid content-stretch flex flex-[1_0_0] gap-[8px] items-center justify-center min-w-px px-[13px] py-[11px] relative rounded-[4px]" data-node-id="2053:2624" data-name="Label - Opção Palestra">
                    <div className="h-[14.212px] relative shrink-0 w-[16.5px]" data-node-id="2053:2625" data-name="Container">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer3} />
                    </div>
                    <div className="relative shrink-0" data-node-id="2053:2627" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[14px] whitespace-nowrap" data-node-id="2053:2628">
                          <p className="leading-[20px]">Palestra</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[6px] items-start pb-[8px] relative shrink-0 w-full" data-node-id="2053:2629" data-name="Descrição">
                <div className="content-stretch flex items-center justify-between relative shrink-0 w-full" data-node-id="2053:2630" data-name="Container">
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2631" data-name="Label">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] whitespace-nowrap" data-node-id="2053:2632">
                      <p>
                        <span className="leading-[20px]">Descrição e Requisitos</span>
                        <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                      </p>
                    </div>
                  </div>
                  <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2633" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[12px] tracking-[0.24px] whitespace-nowrap" data-node-id="2053:2634">
                      <p className="leading-[16px]">Ementa, pré-requisitos e objetivos</p>
                    </div>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-auto px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2635" data-name="Textarea">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2636" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2637">
                        <p className="leading-[24px] whitespace-pre-wrap">{`Abordagem hands-on de arquiteturas convolucionais e modelos YOLO para detecção de objetos  em tempo real. Os participantes devem levar notebook com Python 3.10+ e bibliotecas OpenCV e PyTorch pré-instaladas.`}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col gap-[6px] items-start relative shrink-0 w-full" data-node-id="2053:2638" data-name="Responsável / Palestrante">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2639" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2640">
                    <p>
                      <span className="leading-[20px]">Responsável/Palestrante</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2641" data-name="Container">
                  <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pl-[41px] pr-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2642" data-name="Input">
                    <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2643" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-auto relative rounded-[inherit] size-full">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2644">
                          <p className="leading-[24px]">Dra. Helena Guimarães</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-[28.26%] content-stretch flex flex-col items-center justify-center left-[14px] top-[28.26%]" data-node-id="2053:2645" data-name="Container">
                    <div className="h-[16.25px] relative shrink-0 w-[17.083px]" data-node-id="2053:2646" data-name="Icon">
                      <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" data-node-id="2053:2647" data-name="Section - SEÇÃO 2: Data e Horário">
            <div className="border-[rgba(199,196,216,0.5)] border-b border-solid content-stretch flex items-center pb-[5px] relative shrink-0 w-full" data-node-id="2053:2648" data-name="HorizontalBorder">
              <div className="relative shrink-0" data-node-id="2053:2651" data-name="Heading 3">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[16px] whitespace-nowrap" data-node-id="2053:2652">
                    <p className="leading-[24px]">2. Data e Horário</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-full" data-node-id="2053:2653" data-name="Container">
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px relative" data-node-id="2053:2654" data-name="Data">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2655" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2656">
                    <p>
                      <span className="leading-[20px]">Data da Atividade</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2657" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2658" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center relative size-full">
                      <div className="content-stretch flex flex-[1_0_0] items-start min-w-px overflow-clip relative" data-node-id="2053:2659" data-name="Container">
                        <div className="[word-break:break-word] content-stretch flex font-['Inter:Regular'] font-normal gap-px items-start leading-[0] not-italic px-px relative self-stretch shrink-0 text-[#141b2b] text-[15px] whitespace-nowrap" data-node-id="2053:2660" data-name="Paragraph">
                          <div className="flex flex-col justify-center relative shrink-0" data-node-id="2053:2661">
                            <p className="leading-[24px]">10</p>
                          </div>
                          <div className="flex flex-col justify-center relative shrink-0" data-node-id="2053:2662">
                            <p className="leading-[24px]">/</p>
                          </div>
                          <div className="flex flex-col justify-center relative shrink-0" data-node-id="2053:2663">
                            <p className="leading-[24px]">25</p>
                          </div>
                          <div className="flex flex-col justify-center relative shrink-0" data-node-id="2053:2664">
                            <p className="leading-[24px]">/</p>
                          </div>
                          <div className="flex flex-col justify-center relative shrink-0" data-node-id="2053:2665">
                            <p className="leading-[24px]">2026</p>
                          </div>
                        </div>
                      </div>
                      <div className="content-stretch flex flex-col items-start overflow-clip p-[2px] relative shrink-0 size-[19px]" data-node-id="2053:2666" data-name="Button menu">
                        <div className="h-[14.063px] relative shrink-0 w-[15px]" data-node-id="2053:2667" data-name="image" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px relative" data-node-id="2053:2668" data-name="Início">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2669" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2670">
                    <p>
                      <span className="leading-[20px]">Horário de Início</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2671" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2672" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center relative size-full">
                      <div className="content-stretch flex flex-[1_0_0] h-[24px] items-start min-w-px overflow-clip relative" data-node-id="2053:2673" data-name="Container">
                        <div className="[word-break:break-word] font-['Inter:Regular'] font-normal h-full leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-[74.05px] whitespace-nowrap" data-node-id="2053:2674" data-name="Paragraph">
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-px top-[11.5px]" data-node-id="2053:2675">
                            <p className="leading-[24px]">09</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[20.76px] top-[11.5px]" data-node-id="2053:2676">
                            <p className="leading-[24px]">:</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[26.09px] top-[11.5px]" data-node-id="2053:2677">
                            <p className="leading-[24px]">00</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[49.14px] top-[11.5px]" data-node-id="2053:2678">
                            <p className="leading-[24px]">AM</p>
                          </div>
                        </div>
                      </div>
                      <div className="content-stretch flex flex-col h-[21.75px] items-start pl-[8px] relative shrink-0 w-[29.75px]" data-node-id="2053:2679" data-name="Button menu:margin">
                        <div className="content-stretch flex flex-col items-start overflow-clip p-[3px] relative shrink-0 size-[21.75px]" data-node-id="2053:2680" data-name="Button menu">
                          <div className="relative shrink-0 size-[15.75px]" data-node-id="2053:2681" data-name="image" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px relative" data-node-id="2053:2682" data-name="Término">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2683" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2684">
                    <p>
                      <span className="leading-[20px]">Horário de Término</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2685" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2686" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center relative size-full">
                      <div className="content-stretch flex flex-[1_0_0] h-[24px] items-start min-w-px overflow-clip relative" data-node-id="2053:2687" data-name="Container">
                        <div className="[word-break:break-word] font-['Inter:Regular'] font-normal h-full leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-[70.09px] whitespace-nowrap" data-node-id="2053:2688" data-name="Paragraph">
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-px top-[11.5px]" data-node-id="2053:2689">
                            <p className="leading-[24px]">01</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[17.58px] top-[11.5px]" data-node-id="2053:2690">
                            <p className="leading-[24px]">:</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[22.9px] top-[11.5px]" data-node-id="2053:2691">
                            <p className="leading-[24px]">00</p>
                          </div>
                          <div className="-translate-y-1/2 absolute flex flex-col justify-center left-[45.95px] top-[11.5px]" data-node-id="2053:2692">
                            <p className="leading-[24px]">PM</p>
                          </div>
                        </div>
                      </div>
                      <div className="content-stretch flex flex-col h-[21.75px] items-start pl-[8px] relative shrink-0 w-[29.75px]" data-node-id="2053:2693" data-name="Button menu:margin">
                        <div className="content-stretch flex flex-col items-start overflow-clip p-[3px] relative shrink-0 size-[21.75px]" data-node-id="2053:2694" data-name="Button menu">
                          <div className="relative shrink-0 size-[15.75px]" data-node-id="2053:2695" data-name="image" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex flex-col gap-[6px] items-start relative shrink-0 w-full" data-node-id="2053:2696" data-name="Local">
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2697" data-name="Label">
                <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2698">
                  <p>
                    <span className="leading-[20px]">Local da Atividade</span>
                    <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                  </p>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2699" data-name="Container">
                <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pl-[41px] pr-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2700" data-name="Input">
                  <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2701" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-auto relative rounded-[inherit] size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2702">
                        <p className="leading-[24px]">Lab de Informática 04 - Bloco C</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-[28.26%] content-stretch flex flex-col items-start left-[14px] top-[28.26%]" data-node-id="2053:2703" data-name="Container">
                  <div className="h-[16.667px] relative shrink-0 w-[11.667px]" data-node-id="2053:2704" data-name="Icon">
                    <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgIcon1} />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="content-stretch flex flex-col gap-[16px] items-start relative shrink-0 w-full" data-node-id="2053:2705" data-name="Section - SEÇÃO 3: Inscrições e Vagas">
            <div className="border-[rgba(199,196,216,0.5)] border-b border-solid content-stretch flex items-center pb-[5px] relative shrink-0 w-full" data-node-id="2053:2706" data-name="HorizontalBorder">
              <div className="relative shrink-0" data-node-id="2053:2709" data-name="Heading 3">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[16px] whitespace-nowrap" data-node-id="2053:2710">
                    <p className="leading-[24px]">3. Inscrições e Vagas</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="content-stretch flex gap-[16px] items-start justify-center relative shrink-0 w-full" data-node-id="2053:2711" data-name="Container">
              <div className="content-stretch flex flex-[1_0_0] flex-col gap-[6px] items-start min-w-px pb-[10px] relative" data-node-id="2053:2712" data-name="Vagas">
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2713" data-name="Label">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2714">
                    <p>
                      <span className="leading-[20px]">Número de vagas</span>
                      <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                    </p>
                  </div>
                </div>
                <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2715" data-name="Container">
                  <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip px-[15px] py-[11px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2716" data-name="Input">
                    <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2717" data-name="Container">
                      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center relative size-full">
                        <div className="content-stretch flex flex-[1_0_0] flex-col items-start min-w-px relative" data-node-id="2053:2718" data-name="Container">
                          <div className="content-stretch flex flex-col items-start overflow-auto relative shrink-0 w-full" data-node-id="2053:2719" data-name="Container">
                            <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2720">
                              <p className="leading-[24px]">40</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-row items-center self-stretch" data-node-id="2053:2721">
                          <div className="content-stretch flex h-full items-start relative shrink-0" data-name="Rectangle:align-stretch">
                            <div className="h-full min-w-[15px] opacity-0 relative shrink-0 w-[15px]" data-node-id="2053:2722" data-name="Rectangle" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="absolute bottom-[32.61%] content-stretch flex flex-col items-start right-[14px] top-[32.61%]" data-node-id="2053:2723" data-name="Container">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[12px] tracking-[0.24px] whitespace-nowrap" data-node-id="2053:2724">
                      <p className="leading-[16px]">vagas</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-[1_0_0] items-center min-w-px pt-[24px] relative" data-node-id="2053:2725" data-name="Switch / Checkbox Lista de Espera">
                <div className="bg-[#f9f9ff] border border-[rgba(199,196,216,0.8)] border-solid content-stretch flex flex-[1_0_0] gap-[11px] h-[46px] items-center min-w-px pl-[16px] pr-[53.8px] py-[11px] relative rounded-[4px]" data-node-id="2053:2726" data-name="Label">
                  <div className="bg-[#3525cd] border border-[rgba(0,0,0,0)] border-solid relative rounded-[2px] shrink-0 size-[18px]" data-node-id="2053:2727" data-name="Input">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center overflow-clip p-px relative rounded-[inherit] size-full">
                      <div className="relative shrink-0 size-[16px]" data-node-id="2053:2728" data-name="image">
                        <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgImage} />
                      </div>
                    </div>
                  </div>
                  <div className="relative shrink-0" data-node-id="2053:2730" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                      <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2731" data-name="Container">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] whitespace-nowrap" data-node-id="2053:2732">
                          <p className="leading-[20px]">Permitir lista de espera</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[rgba(249,249,255,0.7)] border border-[#c7c4d8] border-solid content-stretch flex gap-[16px] items-start p-[17px] relative rounded-[8px] shrink-0 w-full" data-node-id="2053:2733" data-name="Atividade Gratuita e Preço Condicional">
              <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2734" data-name="Container">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[8px] items-start relative size-full">
                  <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2735" data-name="Label">
                    <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2736">
                      <p className="leading-[20px]">Atividade gratuita?</p>
                    </div>
                  </div>
                  <div className="bg-[#e1e8fd] border border-[rgba(199,196,216,0.6)] border-solid content-stretch flex items-center px-px py-[5px] relative rounded-[4px] shrink-0 w-[324px]" data-node-id="2053:2737" data-name="Group">
                    <div className="flex flex-row items-center self-stretch" data-node-id="2053:2738">
                      <div className="h-full relative rounded-[6px] shrink-0 w-[160px]" data-name="Label">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center pb-[7.5px] pt-[6.5px] px-[16px] relative size-full">
                          <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[14px] whitespace-nowrap" data-node-id="2053:2739">
                            <p className="leading-[20px]">Sim</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-row items-center self-stretch" data-node-id="2053:2740">
                      <div className="bg-white border border-[rgba(199,196,216,0.3)] border-solid drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] h-full relative rounded-[6px] shrink-0 w-[155px]" data-name="Label">
                        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[7.5px] pt-[6.5px] px-[17px] relative size-full">
                          <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#3525cd] text-[14px] whitespace-nowrap" data-node-id="2053:2741">
                            <p className="leading-[20px]">Não</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-[rgba(199,196,216,0.6)] border-solid border-t flex-[1_0_0] min-w-px relative" data-node-id="2053:2742" data-name="Campo Condicional de Valor">
                <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[6px] items-start pt-[9px] relative size-full">
                  <div className="relative shrink-0 w-full" data-node-id="2053:2743" data-name="Label">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start relative size-full">
                      <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] w-full" data-node-id="2053:2744">
                        <p>
                          <span className="leading-[20px]">Valor da inscrição</span>
                          <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#ba1a1a]">*</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="max-w-[320px] relative shrink-0 w-[320px]" data-node-id="2053:2745" data-name="Container">
                    <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start max-w-[inherit] relative size-full">
                      <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex items-start justify-center overflow-clip pl-[41px] pr-[15px] py-[9px] relative rounded-[4px] shrink-0 w-full" data-node-id="2053:2746" data-name="Input">
                        <div className="flex-[1_0_0] min-w-px relative" data-node-id="2053:2747" data-name="Container">
                          <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-start overflow-auto relative rounded-[inherit] size-full">
                            <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[15px] w-full" data-node-id="2053:2748">
                              <p className="leading-[24px]">30,00</p>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="absolute bottom-[26.19%] content-stretch flex flex-col items-start left-[14px] top-[26.19%]" data-node-id="2053:2749" data-name="Container">
                        <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[14px] whitespace-nowrap" data-node-id="2053:2750">
                          <p className="leading-[20px]">R$</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bg-[#f9f9ff] border-[rgba(199,196,216,0.8)] border-b border-solid content-stretch flex items-start justify-between left-0 pb-[21px] pt-[20px] px-[24px] right-0 top-0" data-node-id="2053:2751" data-name="Header Fixo do Modal">
          <div className="relative shrink-0" data-node-id="2053:2752" data-name="Container">
            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start pr-[16px] relative size-full">
              <div className="content-stretch flex items-center relative shrink-0 w-full" data-node-id="2053:2753" data-name="Container">
                <div className="content-stretch flex flex-col items-start relative shrink-0" data-node-id="2053:2757" data-name="Heading 2">
                  <div className="[word-break:break-word] flex flex-col font-['Inter:Semi_Bold'] font-semibold justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[20px] tracking-[-0.5px] whitespace-nowrap" data-node-id="2053:2758">
                    <p className="leading-[28px]">Nova Atividade do Evento</p>
                  </div>
                </div>
              </div>
              <div className="content-stretch flex flex-col items-start relative shrink-0 w-full" data-node-id="2053:2759" data-name="Container">
                <div className="[word-break:break-word] flex flex-col font-['Inter:Regular'] font-normal justify-center leading-[0] not-italic relative shrink-0 text-[#464555] text-[13px] whitespace-nowrap" data-node-id="2053:2760">
                  <p className="mb-0 whitespace-pre">
                    <span className="leading-[20px]">{`Cadastre minicursos, palestras ou workshops vinculados ao `}</span>
                    <span className="[word-break:break-word] font-['Inter:Medium'] font-medium leading-[20px] not-italic text-[#141b2b]">{`Simpósio Brasileiro de `}</span>
                  </p>
                  <p className="font-['Inter:Medium'] font-medium leading-[20px] text-[#141b2b] whitespace-pre">Computação Quântica e Redes Neurais 2026</p>
                </div>
              </div>
            </div>
          </div>
          <div className="relative rounded-[4px] shrink-0" data-node-id="2053:2761" data-name="Button - Fechar modal">
            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col items-center justify-center pb-[14px] pt-[6px] px-[6px] relative size-full">
              <div className="relative shrink-0 size-[11.667px]" data-node-id="2053:2762" data-name="Container">
                <img alt="" className="absolute block inset-0 max-w-none size-full" src={imgContainer4} />
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bg-[#f9f9ff] border-[rgba(199,196,216,0.8)] border-solid border-t content-stretch flex items-center justify-between left-px pb-[16px] pt-[17px] px-[24px] right-[-1px] top-[1119px]" data-node-id="2053:2764" data-name="Rodapé Fixo do Modal com Ações Relevantes">
          <div className="relative shrink-0" data-node-id="2053:2765" data-name="Container">
            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[6px] items-center relative size-full">
              <div className="h-[14px] relative shrink-0 w-[10.667px]" data-node-id="2053:2766" data-name="Container" />
              <div className="h-[16px] relative shrink-0 w-[324.72px]" data-node-id="2053:2767" data-name="Container" />
            </div>
          </div>
          <div className="relative shrink-0" data-node-id="2053:2768" data-name="Container">
            <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[12px] items-center justify-end relative size-full">
              <div className="bg-white border border-[#c7c4d8] border-solid content-stretch flex flex-col items-center justify-center px-[17px] py-[11px] relative rounded-[4px] shrink-0 w-[120px]" data-node-id="2053:2769" data-name="Button">
                <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[#141b2b] text-[14px] text-center whitespace-nowrap" data-node-id="2053:2770">
                  <p className="leading-[20px]">Cancelar</p>
                </div>
              </div>
              <div className="bg-[#4f46e5] content-stretch drop-shadow-[0px_1px_1px_rgba(0,0,0,0.05)] flex items-center justify-center px-[20px] py-[10px] relative rounded-[4px] shrink-0 w-[120px]" data-node-id="2053:2771" data-name="Button">
                <div className="[word-break:break-word] flex flex-col font-['Inter:Medium'] font-medium justify-center leading-[0] not-italic relative shrink-0 text-[14px] text-center text-white whitespace-nowrap" data-node-id="2053:2772">
                  <p className="leading-[20px]">Salvar</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
SUPER CRITICAL: The generated React+Tailwind code MUST be converted to match the target project's technology stack and styling system.
1. Analyze the target codebase to identify: technology stack, styling approach, component patterns, and design tokens
2. Convert React syntax to the target framework/library
3. Transform all Tailwind classes to the target styling system while preserving exact visual design
4. Follow the project's existing patterns and conventions
DO NOT install any Tailwind as a dependency unless the user instructs you to do so.

Node ids have been added to the code as data attributes, e.g. `data-node-id="1:2"`.
The generated code contains image and SVG URL constants, e.g. const image = `${assetPathPrefix}/<asset file name>`, where assetPathPrefix is declared once at the top of the code and every asset URL interpolates it. These URLs are temporary download sources and expire after 7 days. Download each asset into the project with curl -L, then replace its URL in the generated code with a reference to the downloaded asset. Never use the temporary URLs as runtime image sources.
