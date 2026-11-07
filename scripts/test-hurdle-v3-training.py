import importlib.util
import pathlib
import unittest
import numpy as np

spec=importlib.util.spec_from_file_location("trainer",pathlib.Path(__file__).with_name("train-hurdle-v3-challenger.py"))
if spec is None or spec.loader is None:raise ImportError("Cannot load Hurdle V3 training helpers")
trainer=importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)

class TrainingTests(unittest.TestCase):
    def races(self):
        return [{"id":str(i),"runners":[{"id":"a","winner":True,"raw":{"official_rating":110+i,"official_rating_missing":0}},
                                        {"id":"b","winner":False,"raw":{"official_rating":80+i,"official_rating_missing":0}}]}for i in range(12)]

    def test_deterministic_fitted_race_softmax_improves_uniform(self):
        races=self.races();names=["official_rating","official_rating_missing"]
        a=trainer.fit(races,names,.1);b=trainer.fit(races,names,.1)
        self.assertEqual(a["weights"],b["weights"])
        self.assertLess(trainer.metrics(races,a)["logLoss"],np.log(2))
        self.assertGreater(a["weights"][0],0)

    def test_missing_indicator_cannot_become_positive_even_when_label_would_favour_it(self):
        races=self.races()
        for r in races:r["runners"][0]["raw"]={"official_rating":None,"official_rating_missing":1}
        m=trainer.fit(races,["official_rating","official_rating_missing"],.1)
        self.assertLessEqual(m["weights"][1],0)
        means=np.array(m["means"]);scales=np.array(m["scales"])
        encoded=trainer.design(races,m["names"],means,scales)
        self.assertTrue(np.isfinite(encoded).all())
        self.assertTrue(np.all(encoded[::2,0]==0))

    def test_incomplete_numeric_training_feature_is_rejected(self):
        races=self.races()
        for r in races:
            for p in r["runners"]:p["raw"]["official_rating"]=None
        with self.assertRaises(AssertionError):trainer.fit(races,["official_rating"],.1)

if __name__=="__main__":unittest.main()
