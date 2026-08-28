const Proximity = {

    analisar(bbox, larguraImagem) {

        const larguraObjeto =
            bbox[2];


        const porcentagem =
            larguraObjeto /
            larguraImagem;


        if (porcentagem >= 0.65) {

            return "MUITO_PERTO";

        }


        if (porcentagem >= 0.35) {

            return "PERTO";

        }


        if (porcentagem >= 0.15) {

            return "MEDIO";

        }


        return "LONGE";

    }

};